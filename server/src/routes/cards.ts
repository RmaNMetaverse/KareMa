import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { cardInclude, commentInclude, publicUser } from '../lib/selects';
import { emitBoard } from '../lib/realtime';
import { cardAudience, logActivity, notify } from '../lib/notify';
import { cardPosition } from '../lib/position';

export const cardsRouter = Router();
cardsRouter.use(requireAuth);

async function cardAccess(req: any, cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return { card: null, access: null };
  const access = await getBoardAccess(req.user.id, card.boardId, req.user.role);
  return { card, access };
}

const fullCard = (id: string) => prisma.card.findUnique({ where: { id }, include: cardInclude });

/** Cards assigned to me, across every board I can see. */
cardsRouter.get('/mine', async (req, res) => {
  const cards = await prisma.card.findMany({
    where: { isArchived: false, assignees: { some: { userId: req.user!.id } } },
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
    include: {
      ...cardInclude,
      board: { select: { id: true, title: true, color: true, icon: true } },
      list: { select: { id: true, title: true } },
    },
  });
  res.json({ cards });
});

/** Create a card. */
cardsRouter.post('/', async (req, res) => {
  const parsed = z
    .object({
      listId: z.string(),
      title: z.string().min(1).max(500),
      index: z.number().int().min(0).optional(),
      description: z.string().max(20000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A card title is required' });

  const list = await prisma.list.findUnique({ where: { id: parsed.data.listId } });
  if (!list) return res.status(404).json({ error: 'List not found' });

  const access = await getBoardAccess(req.user!.id, list.boardId, req.user!.role);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const count = await prisma.card.count({ where: { listId: list.id, isArchived: false } });
  const boardCards = await prisma.card.count({ where: { boardId: list.boardId } });
  const position = await cardPosition(list.id, parsed.data.index ?? count);

  const created = await prisma.card.create({
    data: {
      boardId: list.boardId,
      listId: list.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      position,
      number: boardCards + 1,
      createdById: req.user!.id,
      watchers: { create: { userId: req.user!.id } },
    },
  });

  const card = await fullCard(created.id);
  await logActivity(list.boardId, req.user!.id, 'card.created', { title: created.title }, created.id);
  emitBoard(list.boardId, 'card:created', card);
  res.status(201).json({ card });
});

/** One card with its comments and activity. */
cardsRouter.get('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const [full, comments, activities, watchers] = await Promise.all([
    fullCard(card.id),
    prisma.comment.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    }),
    prisma.activity.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: publicUser } },
    }),
    prisma.cardWatcher.findMany({ where: { cardId: card.id }, select: { userId: true } }),
  ]);

  res.json({
    card: {
      ...full,
      comments,
      activities,
      watchers: watchers.map((w) => w.userId),
      isWatching: watchers.some((w) => w.userId === req.user!.id),
      canEdit: access.canEdit,
    },
  });
});

/** Update card fields. */
cardsRouter.patch('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(20000).nullable().optional(),
      color: z.string().max(32).nullable().optional(),
      coverType: z.enum(['color', 'image', 'gradient']).nullable().optional(),
      coverValue: z.string().max(500).nullable().optional(),
      coverSize: z.enum(['normal', 'full']).optional(),
      priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      startDate: z.string().datetime().nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      isComplete: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid card data' });

  const data: any = { ...parsed.data };
  if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  await prisma.card.update({ where: { id: card.id }, data });
  const updated = await fullCard(card.id);

  if (parsed.data.isComplete !== undefined) {
    await logActivity(
      card.boardId,
      req.user!.id,
      parsed.data.isComplete ? 'card.completed' : 'card.reopened',
      { title: card.title },
      card.id
    );
    const audience = await cardAudience(card.id);
    await notify({
      userIds: audience,
      actorId: req.user!.id,
      type: 'card.status',
      message: `${req.user!.name} marked "${card.title}" as ${parsed.data.isComplete ? 'complete' : 'open'}`,
      boardId: card.boardId,
      cardId: card.id,
    });
  }
  if (parsed.data.isArchived === true) {
    await logActivity(card.boardId, req.user!.id, 'card.archived', { title: card.title }, card.id);
  }

  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/** Move a card between lists or within a list. */
cardsRouter.patch('/:id/move', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ listId: z.string(), index: z.number().int().min(0) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid move' });

  const target = await prisma.list.findUnique({ where: { id: parsed.data.listId } });
  if (!target || target.boardId !== card.boardId)
    return res.status(400).json({ error: 'Target list is not on this board' });

  const position = await cardPosition(target.id, parsed.data.index, card.id);
  await prisma.card.update({
    where: { id: card.id },
    data: { listId: target.id, position },
  });
  const updated = await fullCard(card.id);

  if (target.id !== card.listId) {
    const from = await prisma.list.findUnique({ where: { id: card.listId }, select: { title: true } });
    await logActivity(
      card.boardId,
      req.user!.id,
      'card.moved',
      { title: card.title, from: from?.title, to: target.title },
      card.id
    );
    const audience = await cardAudience(card.id);
    await notify({
      userIds: audience,
      actorId: req.user!.id,
      type: 'card.moved',
      message: `${req.user!.name} moved "${card.title}" to ${target.title}`,
      boardId: card.boardId,
      cardId: card.id,
    });
  }

  emitBoard(card.boardId, 'card:moved', {
    card: updated,
    fromListId: card.listId,
    toListId: target.id,
  });
  res.json({ card: updated });
});

cardsRouter.delete('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.card.delete({ where: { id: card.id } });
  await logActivity(card.boardId, req.user!.id, 'card.deleted', { title: card.title });
  emitBoard(card.boardId, 'card:deleted', { id: card.id, listId: card.listId });
  res.json({ ok: true });
});

cardsRouter.post('/:id/duplicate', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const boardCards = await prisma.card.count({ where: { boardId: card.boardId } });
  const siblings = await prisma.card.count({ where: { listId: card.listId, isArchived: false } });
  const copy = await prisma.card.create({
    data: {
      boardId: card.boardId,
      listId: card.listId,
      title: `${card.title} (copy)`,
      description: card.description,
      position: await cardPosition(card.listId, siblings),
      color: card.color,
      coverType: card.coverType,
      coverValue: card.coverValue,
      coverSize: card.coverSize,
      priority: card.priority,
      startDate: card.startDate,
      dueDate: card.dueDate,
      number: boardCards + 1,
      createdById: req.user!.id,
    },
  });

  const labels = await prisma.cardLabel.findMany({ where: { cardId: card.id } });
  if (labels.length) {
    await prisma.cardLabel.createMany({
      data: labels.map((l) => ({ cardId: copy.id, labelId: l.labelId })),
    });
  }

  const full = await fullCard(copy.id);
  emitBoard(card.boardId, 'card:created', full);
  res.status(201).json({ card: full });
});

/* --------------------------------------------------------------- assignees */

cardsRouter.post('/:id/assignees', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const userId = z.string().safeParse(req.body?.userId);
  if (!userId.success) return res.status(400).json({ error: 'Invalid user' });

  await prisma.cardAssignee.upsert({
    where: { cardId_userId: { cardId: card.id, userId: userId.data } },
    create: { cardId: card.id, userId: userId.data },
    update: {},
  });
  await prisma.cardWatcher.upsert({
    where: { cardId_userId: { cardId: card.id, userId: userId.data } },
    create: { cardId: card.id, userId: userId.data },
    update: {},
  });

  const person = await prisma.user.findUnique({ where: { id: userId.data }, select: publicUser });
  await notify({
    userIds: [userId.data],
    actorId: req.user!.id,
    type: 'card.assigned',
    message: `${req.user!.name} assigned you to "${card.title}"`,
    boardId: card.boardId,
    cardId: card.id,
  });
  await logActivity(card.boardId, req.user!.id, 'card.assigned', { name: person?.name, title: card.title }, card.id);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.delete('/:id/assignees/:userId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.cardAssignee
    .delete({ where: { cardId_userId: { cardId: card.id, userId: req.params.userId } } })
    .catch(() => null);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/* ------------------------------------------------------------------ labels */

cardsRouter.post('/:id/labels/:labelId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const existing = await prisma.cardLabel.findUnique({
    where: { cardId_labelId: { cardId: card.id, labelId: req.params.labelId } },
  });
  if (existing) {
    await prisma.cardLabel.delete({ where: { id: existing.id } });
  } else {
    await prisma.cardLabel.create({ data: { cardId: card.id, labelId: req.params.labelId } });
  }

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/* -------------------------------------------------------------- checklists */

cardsRouter.post('/:id/checklists', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const title = z.string().min(1).max(120).safeParse(req.body?.title);
  if (!title.success) return res.status(400).json({ error: 'A checklist title is required' });

  const count = await prisma.checklist.count({ where: { cardId: card.id } });
  await prisma.checklist.create({
    data: { cardId: card.id, title: title.data, position: (count + 1) * 1024 },
  });

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.status(201).json({ card: updated });
});

cardsRouter.delete('/:id/checklists/:checklistId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.checklist.delete({ where: { id: req.params.checklistId } }).catch(() => null);
  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.post('/:id/checklists/:checklistId/items', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const text = z.string().min(1).max(500).safeParse(req.body?.text);
  if (!text.success) return res.status(400).json({ error: 'Item text is required' });

  const count = await prisma.checklistItem.count({ where: { checklistId: req.params.checklistId } });
  await prisma.checklistItem.create({
    data: { checklistId: req.params.checklistId, text: text.data, position: (count + 1) * 1024 },
  });

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.status(201).json({ card: updated });
});

cardsRouter.patch('/:id/checklist-items/:itemId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ text: z.string().min(1).max(500).optional(), isDone: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item' });

  await prisma.checklistItem.update({ where: { id: req.params.itemId }, data: parsed.data });
  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.delete('/:id/checklist-items/:itemId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.checklistItem.delete({ where: { id: req.params.itemId } }).catch(() => null);
  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/* ------------------------------------------------------------------ watch */

cardsRouter.post('/:id/watch', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const existing = await prisma.cardWatcher.findUnique({
    where: { cardId_userId: { cardId: card.id, userId: req.user!.id } },
  });
  if (existing) {
    await prisma.cardWatcher.delete({ where: { id: existing.id } });
    return res.json({ isWatching: false });
  }
  await prisma.cardWatcher.create({ data: { cardId: card.id, userId: req.user!.id } });
  res.json({ isWatching: true });
});
