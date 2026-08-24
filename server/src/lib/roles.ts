import { prisma } from './prisma';

/**
 * Instance-wide permissions. Board-level access is a separate thing and still
 * lives in permissions.ts — these govern what a person may do across KareMa.
 */
export const PERMISSIONS = [
  {
    key: 'admin.access',
    label: 'Open the admin panel',
    description: 'Reach the admin area at all. Everything else here needs it.',
  },
  {
    key: 'users.manage',
    label: 'Manage people',
    description: 'Create accounts, edit them, reset passwords, deactivate and delete.',
  },
  {
    key: 'roles.manage',
    label: 'Manage roles',
    description: 'Create and edit roles, and decide what each one may do.',
  },
  {
    key: 'reports.view',
    label: 'Review anyone’s work',
    description: 'Open the per-person work review with their cards and activity.',
  },
  {
    key: 'labels.manage',
    label: 'Manage label presets',
    description: 'Edit the labels every new board starts with.',
  },
  {
    key: 'boards.create',
    label: 'Create boards',
    description: 'Start a new board of their own.',
  },
  {
    key: 'boards.viewAll',
    label: 'See every board',
    description: 'View all boards on the instance, not only the ones they belong to.',
  },
  {
    key: 'boards.deleteAny',
    label: 'Delete any board',
    description: 'Remove boards they do not own.',
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

/** The three roles every instance starts with. They can be edited but not deleted. */
export const SYSTEM_ROLES = [
  {
    key: 'administrator',
    name: 'Administrator',
    description: 'Full control of the instance, including people and roles.',
    color: '#ef4444',
    rank: 0,
    legacy: 'ADMIN' as const,
    permissions: Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true])),
  },
  {
    key: 'member',
    name: 'Member',
    description: 'Creates boards and works on the ones they belong to.',
    color: '#6366f1',
    rank: 100,
    legacy: 'MEMBER' as const,
    permissions: { 'boards.create': true },
  },
  {
    key: 'guest',
    name: 'Guest',
    description: 'Read-only, unless invited to a board as a member.',
    color: '#64748b',
    rank: 200,
    legacy: 'GUEST' as const,
    permissions: {},
  },
];

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

/** Create the system roles if they are missing, then attach anyone without one. */
export async function ensureRoles() {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        color: role.color,
        rank: role.rank,
        isSystem: true,
        permissions: role.permissions as any,
      },
      // only top up the parts an administrator would not have customised
      update: { isSystem: true },
    });
  }

  const roles = await prisma.role.findMany({ where: { isSystem: true } });
  const byLegacy = new Map(
    SYSTEM_ROLES.map((r) => [r.legacy, roles.find((x) => x.key === r.key)!.id])
  );

  // backfill anyone still on the legacy enum alone
  for (const [legacy, roleId] of byLegacy) {
    await prisma.user.updateMany({
      where: { roleId: null, role: legacy },
      data: { roleId },
    });
  }
}

export type ActorRole = {
  id: string;
  key: string;
  name: string;
  color: string;
  permissions: PermissionMap;
};

/** Resolve the permissions a user actually has right now. */
export function permissionsOf(user: {
  role: string;
  roleRef?: { permissions: unknown } | null;
}): PermissionMap {
  if (user.roleRef?.permissions && typeof user.roleRef.permissions === 'object') {
    return user.roleRef.permissions as PermissionMap;
  }
  // a user with no role record falls back to the legacy tier
  const fallback = SYSTEM_ROLES.find((r) => r.legacy === user.role);
  return (fallback?.permissions ?? {}) as PermissionMap;
}

export function can(permissions: PermissionMap, key: PermissionKey) {
  return permissions[key] === true;
}

/** Sanitise a permission map coming from a request. */
export function cleanPermissions(input: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of ALL_PERMISSIONS) {
    if ((input as any)[key] === true) out[key] = true;
  }
  // managing people or roles is meaningless without a way in
  if (out['users.manage'] || out['roles.manage'] || out['reports.view'] || out['labels.manage']) {
    out['admin.access'] = true;
  }
  return out;
}

/** The legacy enum tier that best matches a permission map. */
export function legacyTierFor(permissions: PermissionMap): 'ADMIN' | 'MEMBER' | 'GUEST' {
  if (permissions['admin.access'] && permissions['users.manage']) return 'ADMIN';
  if (permissions['boards.create']) return 'MEMBER';
  return 'GUEST';
}

/** How many active people can still administer the instance. */
export async function countAdministrators(excludeUserId?: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { role: true, roleRef: { select: { permissions: true } } },
  });
  return users.filter((u) => can(permissionsOf(u), 'users.manage')).length;
}
