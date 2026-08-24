import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, requireAuth, requirePermission } from '../lib/auth';
import { publicUser } from '../lib/selects';
import {
  ALL_PERMISSIONS,
  can,
  cleanPermissions,
  countAdministrators,
  legacyTierFor,
  PERMISSIONS,
  permissionsOf,
  SYSTEM_ROLES,
} from '../lib/roles';

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePermission('admin.access'));

const roleSummary = { select: { id: true, key: true, name: true, color: true, rank: true } };

const adminUser = {
  ...publicUser,
  createdAt: true,
  lastSeenAt: true,
  mustChangePw: true,
  roleId: true,
  roleRef: roleSummary,
} as const;

/* ------------------------------------------------------------------- users */

adminRouter.get('/users', requirePermission('users.manage'), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      ...adminUser,
      _count: { select: { boardMemberships: true, cardAssignments: true, comments: true } },
    },
  });
  res.json({ users });
});

adminRouter.post('/users', requirePermission('users.manage'), async (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      name: z.string().min(1).max(80),
      password: z.string().min(6),
      roleId: z.string().optional(),
      title: z.string().max(120).optional(),
      avatarColor: z.string().max(32).optional(),
      mustChangePw: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });

  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } }))
    return res.status(409).json({ error: 'A user with that email already exists' });

  const role = parsed.data.roleId
    ? await prisma.role.findUnique({ where: { id: parsed.data.roleId } })
    : await prisma.role.findUnique({ where: { key: 'member' } });
  if (!role) return res.status(400).json({ error: 'That role no longer exists' });

  const palette = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e', '#14b8a6'];
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      roleId: role.id,
      role: legacyTierFor(role.permissions as any),
      title: parsed.data.title,
      avatarColor: parsed.data.avatarColor || palette[Math.floor(Math.random() * palette.length)],
      mustChangePw: parsed.data.mustChangePw ?? true,
    },
    select: adminUser,
  });
  res.status(201).json({ user });
});

adminRouter.patch('/users/:id', requirePermission('users.manage'), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(80).optional(),
      email: z.string().email().optional(),
      roleId: z.string().optional(),
      isActive: z.boolean().optional(),
      title: z.string().max(120).nullable().optional(),
      avatarColor: z.string().max(32).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user data' });

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { roleRef: true },
  });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const wasAdmin = can(permissionsOf(target), 'users.manage');
  let nextRole = target.roleRef;

  if (parsed.data.roleId && parsed.data.roleId !== target.roleId) {
    nextRole = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
    if (!nextRole) return res.status(400).json({ error: 'That role no longer exists' });
  }

  const willAdmin =
    parsed.data.isActive === false
      ? false
      : can((nextRole?.permissions ?? {}) as any, 'users.manage');

  // never let the instance lose its last administrator
  if (wasAdmin && !willAdmin && (await countAdministrators(target.id)) === 0) {
    return res
      .status(400)
      .json({ error: 'There must always be at least one active administrator' });
  }

  const data: any = { ...parsed.data };
  if (data.email) data.email = data.email.trim().toLowerCase();
  if (nextRole) {
    data.roleId = nextRole.id;
    data.role = legacyTierFor(nextRole.permissions as any);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: adminUser,
  });
  res.json({ user });
});

adminRouter.post('/users/:id/password', requirePermission('users.manage'), async (req, res) => {
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

adminRouter.delete('/users/:id', requirePermission('users.manage'), async (req, res) => {
  if (req.params.id === req.user!.id)
    return res.status(400).json({ error: 'You cannot delete your own account' });

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { roleRef: true },
  });
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (can(permissionsOf(target), 'users.manage') && (await countAdministrators(target.id)) === 0) {
    return res
      .status(400)
      .json({ error: 'There must always be at least one active administrator' });
  }

  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- roles */

adminRouter.get('/roles', async (_req, res) => {
  const roles = await prisma.role.findMany({
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { users: true } } },
  });
  res.json({ roles, catalog: PERMISSIONS });
});

adminRouter.post('/roles', requirePermission('roles.manage'), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(60),
      description: z.string().max(300).nullable().optional(),
      color: z.string().max(32).optional(),
      rank: z.number().int().min(0).max(999).optional(),
      permissions: z.record(z.boolean()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A role name is required' });

  const key = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (!key) return res.status(400).json({ error: 'That name cannot be turned into a role key' });
  if (await prisma.role.findUnique({ where: { key } }))
    return res.status(409).json({ error: 'A role with a similar name already exists' });

  const role = await prisma.role.create({
    data: {
      key,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color || '#6366f1',
      rank: parsed.data.rank ?? 100,
      isSystem: false,
      permissions: cleanPermissions(parsed.data.permissions) as any,
    },
    include: { _count: { select: { users: true } } },
  });
  res.status(201).json({ role });
});

adminRouter.patch('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(60).optional(),
      description: z.string().max(300).nullable().optional(),
      color: z.string().max(32).optional(),
      rank: z.number().int().min(0).max(999).optional(),
      permissions: z.record(z.boolean()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role data' });

  const role = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const data: any = { ...parsed.data };
  if (parsed.data.permissions) {
    const next = cleanPermissions(parsed.data.permissions);

    // taking admin away from a role can strand the instance
    if (can(role.permissions as any, 'users.manage') && !can(next, 'users.manage')) {
      const holders = await prisma.user.count({ where: { roleId: role.id, isActive: true } });
      if (holders > 0 && (await countAdministratorsOutside(role.id)) === 0) {
        return res
          .status(400)
          .json({ error: 'This is the only role that can manage people — give another role that permission first' });
      }
    }
    data.permissions = next;
  }

  const updated = await prisma.role.update({
    where: { id: role.id },
    data,
    include: { _count: { select: { users: true } } },
  });

  // keep the legacy tier on each holder in step with the new permissions
  if (parsed.data.permissions) {
    await prisma.user.updateMany({
      where: { roleId: role.id },
      data: { role: legacyTierFor(updated.permissions as any) },
    });
  }

  res.json({ role: updated });
});

adminRouter.delete('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return res.status(404).json({ error: 'Role not found' });
  if (role.isSystem) return res.status(400).json({ error: 'Built-in roles cannot be deleted' });

  // move anyone holding it to a replacement, defaulting to Member
  const fallbackId = z.string().optional().safeParse(req.body?.reassignTo);
  const fallback = fallbackId.success && fallbackId.data
    ? await prisma.role.findUnique({ where: { id: fallbackId.data } })
    : await prisma.role.findUnique({ where: { key: 'member' } });
  if (!fallback) return res.status(400).json({ error: 'No role to move these people to' });

  if (role._count.users > 0) {
    await prisma.user.updateMany({
      where: { roleId: role.id },
      data: { roleId: fallback.id, role: legacyTierFor(fallback.permissions as any) },
    });
  }

  await prisma.role.delete({ where: { id: role.id } });
  res.json({ ok: true, movedTo: { id: fallback.id, name: fallback.name }, moved: role._count.users });
});

async function countAdministratorsOutside(roleId: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true, NOT: { roleId } },
    select: { role: true, roleRef: { select: { permissions: true } } },
  });
  return users.filter((u) => can(permissionsOf(u), 'users.manage')).length;
}

/* ---------------------------------------------------------- label presets */

const DEFAULT_LABEL_PRESETS = [
  { name: 'Bug', color: '#ef4444' },
  { name: 'Feature', color: '#22c55e' },
  { name: 'Design', color: '#a855f7' },
  { name: 'Blocked', color: '#f97316' },
  { name: 'Research', color: '#0ea5e9' },
  { name: 'Polish', color: '#eab308' },
];

adminRouter.get('/label-presets', async (_req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: 'labelPresets' } });
  res.json({ presets: (row?.value as any) ?? DEFAULT_LABEL_PRESETS });
});

adminRouter.put('/label-presets', requirePermission('labels.manage'), async (req, res) => {
  const parsed = z
    .array(z.object({ name: z.string().max(60), color: z.string().max(32) }))
    .max(30)
    .safeParse(req.body?.presets);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid label presets' });

  await prisma.setting.upsert({
    where: { key: 'labelPresets' },
    create: { key: 'labelPresets', value: parsed.data as any },
    update: { value: parsed.data as any },
  });
  res.json({ presets: parsed.data });
});

/* ------------------------------------------------------- stats and boards */

adminRouter.get('/stats', async (_req, res) => {
  const [users, activeUsers, boards, cards, comments, attachments, roles] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.board.count({ where: { isArchived: false } }),
    prisma.card.count({ where: { isArchived: false } }),
    prisma.comment.count(),
    prisma.attachment.aggregate({ _count: true, _sum: { size: true } }),
    prisma.role.count(),
  ]);
  res.json({
    stats: {
      users,
      activeUsers,
      boards,
      cards,
      comments,
      roles,
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
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

adminRouter.put('/settings', async (req, res) => {
  for (const [key, value] of Object.entries(req.body?.settings ?? {})) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
  }
  const rows = await prisma.setting.findMany();
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

/* ------------------------------------------------------------ user review */

/**
 * A review of one person's work: totals, a day-by-day trend, a per-board
 * breakdown, their open and recently finished cards, and a raw activity trail.
 */
adminRouter.get('/users/:id/report', requirePermission('reports.view'), async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 7), 365);
  const since = new Date(Date.now() - days * 86400000);
  const userId = req.params.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUser, createdAt: true, lastSeenAt: true, roleRef: roleSummary },
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
    checklistTicks,
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
    prisma.activity.count({ where: { userId, type: 'checklist.checked' } }),
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
  const buckets = new Map<
    string,
    { date: string; completed: number; created: number; comments: number; checklist: number }
  >();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    buckets.set(key, { date: key, completed: 0, created: 0, comments: 0, checklist: 0 });
  }
  for (const a of activities) {
    const bucket = buckets.get(a.createdAt.toISOString().slice(0, 10));
    if (!bucket) continue;
    if (a.type === 'card.completed') bucket.completed++;
    else if (a.type === 'card.created') bucket.created++;
    else if (a.type === 'comment.added') bucket.comments++;
    else if (a.type === 'checklist.checked') bucket.checklist++;
  }

  const boards = await Promise.all(
    memberships.map(async (m) => {
      const [total, done] = await Promise.all([
        prisma.card.count({
          where: { boardId: m.boardId, isArchived: false, assignees: { some: { userId } } },
        }),
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
        checklistTicks,
        attachments: attachmentAgg._count,
        storageBytes: attachmentAgg._sum.size || 0,
        boards: memberships.length,
        completionRate: assigned ? Math.round((completed / assigned) * 100) : 0,
        actionsInWindow: activities.length,
        completedInWindow: activities.filter((a) => a.type === 'card.completed').length,
      },
      trend: Array.from(buckets.values()),
      boards: boards.sort((a, b) => b.assigned - a.assigned),
      openCards,
      doneCards,
      activity: activities.slice(0, 60),
    },
  });
});

export { ALL_PERMISSIONS, SYSTEM_ROLES };
