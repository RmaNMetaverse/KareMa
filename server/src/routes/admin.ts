import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, requireAdmin, requireAuth } from '../lib/auth';
import { publicUser } from '../lib/selects';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      ...publicUser,
      createdAt: true,
      lastSeenAt: true,
      mustChangePw: true,
      _count: { select: { boardMemberships: true, cardAssignments: true, comments: true } },
    },
  });
  res.json({ users });
});

adminRouter.post('/users', async (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      name: z.string().min(1).max(80),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'MEMBER', 'GUEST']).default('MEMBER'),
      title: z.string().max(120).optional(),
      avatarColor: z.string().max(32).optional(),
      mustChangePw: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

  const palette = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e', '#14b8a6'];
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      title: parsed.data.title,
      avatarColor: parsed.data.avatarColor || palette[Math.floor(Math.random() * palette.length)],
      mustChangePw: parsed.data.mustChangePw ?? true,
    },
    select: { ...publicUser, createdAt: true, lastSeenAt: true, mustChangePw: true },
  });
  res.status(201).json({ user });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(80).optional(),
      email: z.string().email().optional(),
      role: z.enum(['ADMIN', 'MEMBER', 'GUEST']).optional(),
      isActive: z.boolean().optional(),
      title: z.string().max(120).nullable().optional(),
      avatarColor: z.string().max(32).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user data' });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Never allow the last active admin to be demoted or disabled.
  const losingAdmin =
    (parsed.data.role && parsed.data.role !== 'ADMIN' && target.role === 'ADMIN') ||
    (parsed.data.isActive === false && target.role === 'ADMIN');
  if (losingAdmin) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (admins <= 1)
      return res.status(400).json({ error: 'There must always be at least one active administrator' });
  }

  const data: any = { ...parsed.data };
  if (data.email) data.email = data.email.trim().toLowerCase();

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { ...publicUser, createdAt: true, lastSeenAt: true, mustChangePw: true },
  });
  res.json({ user });
});

adminRouter.post('/users/:id/password', async (req, res) => {
  const parsed = z
    .object({ password: z.string().min(6), mustChangePw: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  await prisma.user.update({
    where: { id: req.params.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePw: parsed.data.mustChangePw ?? true,
    },
  });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user!.id)
    return res.status(400).json({ error: 'You cannot delete your own account' });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (admins <= 1)
      return res.status(400).json({ error: 'There must always be at least one active administrator' });
  }

  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

adminRouter.get('/stats', async (_req, res) => {
  const [users, activeUsers, boards, cards, comments, attachments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.board.count({ where: { isArchived: false } }),
    prisma.card.count({ where: { isArchived: false } }),
    prisma.comment.count(),
    prisma.attachment.aggregate({ _count: true, _sum: { size: true } }),
  ]);
  res.json({
    stats: {
      users,
      activeUsers,
      boards,
      cards,
      comments,
      attachments: attachments._count,
      storageBytes: attachments._sum.size || 0,
    },
  });
});

adminRouter.get('/boards', async (_req, res) => {
  const boards = await prisma.board.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: publicUser },
      _count: { select: { cards: true, members: true, lists: true } },
    },
  });
  res.json({ boards });
});

adminRouter.get('/settings', async (_req, res) => {
  const rows = await prisma.setting.findMany();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({ settings });
});

adminRouter.put('/settings', async (req, res) => {
  const entries = Object.entries(req.body?.settings ?? {});
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
  }
  const rows = await prisma.setting.findMany();
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

/**
 * A review of one person's work: totals, a day-by-day trend, a per-board
 * breakdown, their open and recently finished cards, and a raw activity trail.
 */
adminRouter.get('/users/:id/report', async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 7), 365);
  const since = new Date(Date.now() - days * 86400000);
  const userId = req.params.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUser, createdAt: true, lastSeenAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const assignedWhere = { isArchived: false, assignees: { some: { userId } } };

  const [
    assigned,
    completed,
    open,
    overdue,
    createdCards,
    comments,
    attachmentAgg,
    memberships,
    activities,
    openCards,
    doneCards,
  ] = await Promise.all([
    prisma.card.count({ where: assignedWhere }),
    prisma.card.count({ where: { ...assignedWhere, isComplete: true } }),
    prisma.card.count({ where: { ...assignedWhere, isComplete: false } }),
    prisma.card.count({
      where: { ...assignedWhere, isComplete: false, dueDate: { lt: new Date() } },
    }),
    prisma.card.count({ where: { createdById: userId, isArchived: false } }),
    prisma.comment.count({ where: { authorId: userId } }),
    prisma.attachment.aggregate({
      where: { uploaderId: userId },
      _count: true,
      _sum: { size: true },
    }),
    prisma.boardMember.findMany({
      where: { userId },
      include: {
        board: { select: { id: true, title: true, color: true, icon: true, isArchived: true } },
      },
    }),
    prisma.activity.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 400,
      include: {
        board: { select: { id: true, title: true, color: true, icon: true } },
        card: { select: { id: true, title: true } },
      },
    }),
    prisma.card.findMany({
      where: { ...assignedWhere, isComplete: false },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 60,
      include: {
        board: { select: { id: true, title: true, color: true, icon: true } },
        list: { select: { id: true, title: true } },
        labels: { include: { label: true } },
      },
    }),
    prisma.card.findMany({
      where: { ...assignedWhere, isComplete: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      include: {
        board: { select: { id: true, title: true, color: true, icon: true } },
        list: { select: { id: true, title: true } },
        labels: { include: { label: true } },
      },
    }),
  ]);

  // day-by-day trend, oldest first, with empty days filled in
  const buckets = new Map<string, { date: string; completed: number; created: number; comments: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    buckets.set(key, { date: key, completed: 0, created: 0, comments: 0 });
  }
  for (const a of activities) {
    const key = a.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (a.type === 'card.completed') bucket.completed++;
    else if (a.type === 'card.created') bucket.created++;
    else if (a.type === 'comment.added') bucket.comments++;
  }

  // per-board split of their assigned work
  const boards = await Promise.all(
    memberships.map(async (m) => {
      const [total, done] = await Promise.all([
        prisma.card.count({ where: { boardId: m.boardId, isArchived: false, assignees: { some: { userId } } } }),
        prisma.card.count({
          where: {
            boardId: m.boardId,
            isArchived: false,
            isComplete: true,
            assignees: { some: { userId } },
          },
        }),
      ]);
      return { ...m.board, role: m.role, assigned: total, completed: done };
    })
  );

  const inWindow = activities.filter((a) => a.createdAt >= since);

  res.json({
    report: {
      user,
      days,
      totals: {
        assigned,
        open,
        completed,
        overdue,
        createdCards,
        comments,
        attachments: attachmentAgg._count,
        storageBytes: attachmentAgg._sum.size || 0,
        boards: memberships.length,
        completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
        actionsInWindow: inWindow.length,
        completedInWindow: inWindow.filter((a) => a.type === 'card.completed').length,
      },
      trend: Array.from(buckets.values()),
      boards: boards.sort((a, b) => b.assigned - a.assigned),
      openCards,
      doneCards,
      activity: activities.slice(0, 60),
    },
  });
});
