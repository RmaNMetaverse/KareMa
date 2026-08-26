import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { publicUser, cardInclude } from '../lib/selects';
import { emitBoard } from '../lib/realtime';
import { logActivity, notify } from '../lib/notify';
import { listPosition } from '../lib/position';
import { uploadImage, removeStoredFile, storedNameFromUrl } from '../lib/upload';

export const boardsRouter = Router();
boardsRouter.use(requireAuth);

const DEFAULT_LABELS = [
  { name: 'Bug', color: '#ef4444' },
  { name: 'Feature', color: '#22c55e' },
  { name: 'Design', color: '#a855f7' },
  { name: 'Blocked', color: '#f97316' },
  { name: 'Research', color: '#0ea5e9' },
  { name: 'Polish', color: '#eab308' },
];

/** New boards start with whatever label set an administrator configured. */
async function labelPresets() {
  const row = await prisma.setting.findUnique({ where: { key: 'labelPresets' } });
  const value = row?.value as { name: string; color: string }[] | undefined;
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_LABELS;
  return value
    .filter((l) => l && typeof l.color === 'string')
    .map((l) => ({ name: String(l.name ?? '').slice(0, 60), color: l.color }))
    .slice(0, 30);
}

/** Boards visible to the current user. */
boardsRouter.get('/', async (req, res) => {
  const seesEverything = req.user!.can('boards.viewAll');
  const boards = await prisma.board.findMany({
    where: {
      isArchived: req.query.archived === 'true',
      ...(seesEverything
        ? {}
        : { OR: [{ members: { some: { userId: req.user!.id } } }, { isPublic: true }] }),
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    include: {
      createdBy: { select: publicUser },
      members: { include: { user: { select: publicUser } } },
      _count: { select: { cards: true, lists: true } },
    },
  });

  const withMeta = boards.map((b) => {
    const mine = b.members.find((m) => m.userId === req.user!.id);
    return {
      ...b,
      starred: mine?.starred ?? false,
      myRole: mine?.role ?? (seesEverything ? 'ADMIN' : 'VIEWER'),
    };
  });
  res.json({ boards: withMeta });
});

boardsRouter.post('/', async (req, res) => {
  if (!req.user!.can('boards.create'))
    return res.status(403).json({ error: 'Your role cannot create boards' });

  const parsed = z
    .object({
      title: z.string().min(1).max(120),
      description: z.string().max(1000).optional(),
      color: z.string().max(32).optional(),
      background: z.string().max(200).optional(),
      icon: z.string().max(16).optional(),
      withStarterLists: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A board title is required' });

  const board = await prisma.board.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      color: parsed.data.color || '#6366f1',
      background: parsed.data.background,
      icon: parsed.data.icon,
      createdById: req.user!.id,
      members: { create: { userId: req.user!.id, role: 'OWNER' } },
      labels: { create: await labelPresets() },
      ...(parsed.data.withStarterLists === false
        ? {}
        : {
            lists: {
              create: [
                { title: 'Backlog', position: 1024 },
                { title: 'In Progress', position: 2048 },
                { title: 'In Review', position: 3072 },
                { title: 'Done', position: 4096 },
              ],
            },
          }),
    },
    include: {
      createdBy: { select: publicUser },
      members: { include: { user: { select: publicUser } } },
      _count: { select: { cards: true, lists: true } },
    },
  });

  await logActivity(board.id, req.user!.id, 'board.created', { title: board.title });
  res.status(201).json({ board: { ...board, myRole: 'OWNER', starred: false } });
});

/** Full board payload: lists with their cards. */
boardsRouter.get('/:id', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access) return res.status(404).json({ error: 'Board not found' });

  const board = await prisma.board.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: publicUser },
      members: { include: { user: { select: publicUser } } },
      labels: true,
      lists: {
        where: { isArchived: false },
        orderBy: { position: 'asc' },
        include: {
          cards: {
            where: { isArchived: false },
            orderBy: { position: 'asc' },
            include: cardInclude,
          },
        },
      },
    },
  });
  if (!board) return res.status(404).json({ error: 'Board not found' });

  res.json({
    board: {
      ...board,
      myRole: access.role,
      canEdit: access.canEdit,
      canManage: access.canManage,
      starred: board.members.find((m) => m.userId === req.user!.id)?.starred ?? false,
    },
  });
});

boardsRouter.patch('/:id', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canManage) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({
      title: z.string().min(1).max(120).optional(),
      description: z.string().max(1000).nullable().optional(),
      color: z.string().max(32).optional(),
      background: z.string().max(200).nullable().optional(),
      icon: z.string().max(16).nullable().optional(),
      isArchived: z.boolean().optional(),
      isPublic: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid board data' });

  const board = await prisma.board.update({ where: { id: req.params.id }, data: parsed.data });
  emitBoard(board.id, 'board:updated', board);
  res.json({ board });
});

/* ------------------------------------------------------------ background */

/**
 * Set the board's background picture. It is rendered blurred behind the lists,
 * so a busy photo still works; how blurred is a per-viewer appearance setting.
 */
boardsRouter.post('/:id/background', uploadImage.single('file'), async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canManage) {
    // multer has already written the file, so do not leave it behind
    removeStoredFile(req.file?.filename);
    return res.status(403).json({ error: 'You cannot edit this board' });
  }
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

  const current = await prisma.board.findUnique({
    where: { id: req.params.id },
    select: { background: true },
  });
  const board = await prisma.board.update({
    where: { id: req.params.id },
    data: { background: `/api/files/${req.file.filename}` },
  });

  removeStoredFile(storedNameFromUrl(current?.background));
  await logActivity(board.id, req.user!.id, 'board.background.set', {});
  emitBoard(board.id, 'board:updated', board);
  res.json({ board });
});

boardsRouter.delete('/:id/background', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canManage) return res.status(403).json({ error: 'You cannot edit this board' });

  const current = await prisma.board.findUnique({
    where: { id: req.params.id },
    select: { background: true },
  });
  const board = await prisma.board.update({
    where: { id: req.params.id },
    data: { background: null },
  });

  removeStoredFile(storedNameFromUrl(current?.background));
  emitBoard(board.id, 'board:updated', board);
  res.json({ board });
});

boardsRouter.post('/:id/star', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access) return res.status(404).json({ error: 'Board not found' });

  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: req.params.id, userId: req.user!.id } },
  });
  if (!existing) return res.status(400).json({ error: 'Join the board before starring it' });

  const member = await prisma.boardMember.update({
    where: { id: existing.id },
    data: { starred: !existing.starred },
  });
  res.json({ starred: member.starred });
});

boardsRouter.delete('/:id', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  const isOwner = access?.role === 'OWNER' || req.user!.can('boards.deleteAny');
  if (!isOwner) return res.status(403).json({ error: 'Only the board owner can delete it' });

  await prisma.board.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ members */

boardsRouter.post('/:id/members', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canManage) return res.status(403).json({ error: 'You cannot manage this board' });

  const parsed = z
    .object({ userId: z.string(), role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER') })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid member data' });

  const member = await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: req.params.id, userId: parsed.data.userId } },
    create: { boardId: req.params.id, userId: parsed.data.userId, role: parsed.data.role },
    update: { role: parsed.data.role },
    include: { user: { select: publicUser } },
  });

  const board = await prisma.board.findUnique({
    where: { id: req.params.id },
    select: { title: true },
  });
  await notify({
    userIds: [parsed.data.userId],
    actorId: req.user!.id,
    type: 'board.invited',
    message: `${req.user!.name} added you to "${board?.title}"`,
    boardId: req.params.id,
  });
  await logActivity(req.params.id, req.user!.id, 'member.added', { name: member.user.name });
  emitBoard(req.params.id, 'member:added', member);
  res.status(201).json({ member });
});

boardsRouter.patch('/:id/members/:userId', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canManage) return res.status(403).json({ error: 'You cannot manage this board' });

  const role = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).safeParse(req.body?.role);
  if (!role.success) return res.status(400).json({ error: 'Invalid role' });

  const member = await prisma.boardMember.update({
    where: { boardId_userId: { boardId: req.params.id, userId: req.params.userId } },
    data: { role: role.data },
    include: { user: { select: publicUser } },
  });
  emitBoard(req.params.id, 'member:updated', member);
  res.json({ member });
});

boardsRouter.delete('/:id/members/:userId', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  const removingSelf = req.params.userId === req.user!.id;
  if (!access?.canManage && !removingSelf)
    return res.status(403).json({ error: 'You cannot manage this board' });

  const target = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: req.params.id, userId: req.params.userId } },
  });
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'OWNER') {
    const owners = await prisma.boardMember.count({
      where: { boardId: req.params.id, role: 'OWNER' },
    });
    if (owners <= 1) return res.status(400).json({ error: 'A board must keep at least one owner' });
  }

  await prisma.boardMember.delete({ where: { id: target.id } });
  emitBoard(req.params.id, 'member:removed', { userId: req.params.userId });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- labels */

boardsRouter.post('/:id/labels', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ name: z.string().max(60).default(''), color: z.string().max(32) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid label' });

  const label = await prisma.label.create({ data: { ...parsed.data, boardId: req.params.id } });
  emitBoard(req.params.id, 'label:created', label);
  res.status(201).json({ label });
});

boardsRouter.patch('/:id/labels/:labelId', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ name: z.string().max(60).optional(), color: z.string().max(32).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid label' });

  const label = await prisma.label.update({ where: { id: req.params.labelId }, data: parsed.data });
  emitBoard(req.params.id, 'label:updated', label);
  res.json({ label });
});

boardsRouter.delete('/:id/labels/:labelId', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.label.delete({ where: { id: req.params.labelId } });
  emitBoard(req.params.id, 'label:deleted', { id: req.params.labelId });
  res.json({ ok: true });
});

/* -------------------------------------------------------------------- lists */

boardsRouter.post('/:id/lists', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({
      title: z.string().min(1).max(120),
      index: z.number().int().min(0).optional(),
      color: z.string().max(32).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A list title is required' });

  const count = await prisma.list.count({ where: { boardId: req.params.id, isArchived: false } });
  const position = await listPosition(req.params.id, parsed.data.index ?? count);

  const list = await prisma.list.create({
    data: {
      boardId: req.params.id,
      title: parsed.data.title,
      color: parsed.data.color ?? null,
      position,
    },
  });
  await logActivity(req.params.id, req.user!.id, 'list.created', { title: list.title });
  emitBoard(req.params.id, 'list:created', { ...list, cards: [] });
  res.status(201).json({ list: { ...list, cards: [] } });
});

/* ----------------------------------------------------------------- activity */

boardsRouter.get('/:id/activity', async (req, res) => {
  const access = await getBoardAccess(req.user!, req.params.id);
  if (!access) return res.status(404).json({ error: 'Board not found' });

  const activities = await prisma.activity.findMany({
    where: { boardId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200),
    include: { user: { select: publicUser }, card: { select: { id: true, title: true } } },
  });
  res.json({ activities });
});
