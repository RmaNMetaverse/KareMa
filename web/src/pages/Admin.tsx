import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  ShieldCheck,
  HardDrive,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Plus,
  Search,
  Shield,
  SquareKanban,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { useApp } from '../store/app';
import { cn, formatBytes, formatDate, timeAgo } from '../lib/utils';
import { PRESET_PRIMARIES } from '../lib/theme';
import { UserReviewPanel } from '../components/admin/UserReviewPanel';
import { LabelPresetsCard, Role, RolesTab } from '../components/admin/RolesTab';
import {
  Avatar,
  ConfirmDialog,
  Field,
  Modal,
  ModalHeader,
  Spinner,
  Switch,
} from '../components/ui';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Activity size={16} />, permission: 'admin.access' },
  { id: 'users', label: 'Users', icon: <Users size={16} />, permission: 'users.manage' },
  { id: 'roles', label: 'Roles', icon: <ShieldCheck size={16} />, permission: 'roles.manage' },
  { id: 'boards', label: 'Boards', icon: <LayoutGrid size={16} />, permission: 'admin.access' },
];

const ROLE_STYLES: Record<string, string> = {
  ADMIN: 'bg-danger/14 text-danger',
  MEMBER: 'bg-primary/14 text-primary',
  GUEST: 'bg-surface3/70 text-muted',
};

export function AdminPage() {
  const { tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const allowed = TABS.filter((t) => user?.permissions?.[t.permission]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-danger/14 text-danger">
          <Shield size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Admin panel</h1>
          <p className="text-sm text-muted">Manage people, access and content on this instance.</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line/70">
        {allowed.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/admin/${t.id}`)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <UsersTab />}
        {tab === 'roles' && (
          <div className="space-y-6">
            <RolesTab />
            <LabelPresetsCard />
          </div>
        )}
        {tab === 'boards' && <BoardsTab />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- overview */

function Overview() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    get<{ stats: any }>('/api/admin/stats').then((r) => setStats(r.stats));
  }, []);

  if (!stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'People', value: stats.users, hint: `${stats.activeUsers} active`, icon: <Users size={18} /> },
    { label: 'Boards', value: stats.boards, icon: <SquareKanban size={18} /> },
    { label: 'Cards', value: stats.cards, icon: <LayoutGrid size={18} /> },
    { label: 'Comments', value: stats.comments, icon: <MessageSquare size={18} /> },
    { label: 'Attachments', value: stats.attachments, icon: <HardDrive size={18} /> },
    {
      label: 'Storage used',
      value: formatBytes(stats.storageBytes),
      hint: 'on the attachments volume',
      icon: <HardDrive size={18} />,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="glass glass-sheen rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted">
            {c.icon}
            <span className="text-xs font-medium uppercase tracking-wide">{c.label}</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">{c.value}</p>
          {c.hint && <p className="mt-0.5 text-xs text-muted">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ users */

function UsersTab() {
  const { user: me, toast } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [resetting, setResetting] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [reviewing, setReviewing] = useState<any>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await get<{ users: any[] }>('/api/admin/users');
      setUsers(res.users);
    } catch (err: any) {
      // Without this the list silently keeps showing whatever it had before,
      // which reads as "creating the user did nothing".
      toast({ title: `Could not refresh the list: ${err.message}`, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    get<{ roles: Role[] }>('/api/admin/roles')
      .then((r) => setRoles(r.roles))
      .catch(() => undefined);
  }, []);

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase())
  );

  const setRole = async (u: any, roleId: string) => {
    try {
      await patch(`/api/admin/users/${u.id}`, { roleId });
      load();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
      load();
    }
  };

  const setActive = async (u: any, isActive: boolean) => {
    try {
      await patch(`/api/admin/users/${u.id}`, { isActive });
      load();
      toast({ title: isActive ? `${u.name} enabled` : `${u.name} deactivated`, tone: 'info' });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder="Search people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn btn-primary ml-auto" onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} />
          New user
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/70 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Person</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Role</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Last seen</th>
                <th className="px-4 py-3 font-semibold">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className={cn(
                    'border-b border-line/40 transition-colors last:border-0 hover:bg-surface2/50',
                    !u.isActive && 'opacity-55'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size={34} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium">
                          {u.name}
                          {u.id === me?.id && (
                            <span className="chip bg-surface3/70 text-[10px] text-muted">you</span>
                          )}
                          {u.mustChangePw && (
                            <span
                              className="chip bg-warning/16 text-[10px] text-warning"
                              title="Must set a new password at next sign-in"
                            >
                              temp password
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <select
                      className="input w-32 py-1 text-xs"
                      style={
                        u.roleRef
                          ? { color: u.roleRef.color, background: `${u.roleRef.color}18` }
                          : undefined
                      }
                      value={u.roleId ?? ''}
                      onChange={(e) => setRole(u, e.target.value)}
                    >
                      {!u.roleId && <option value="">No role</option>}
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                    {u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'never signed in'}
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={u.isActive} onChange={(v) => setActive(u, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn btn-ghost btn-icon text-muted hover:text-primary"
                        title="Review their work"
                        onClick={() => setReviewing(u)}
                      >
                        <BarChart3 size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        title="Edit"
                        onClick={() => setEditing(u)}
                      >
                        <UserCog size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        title="Reset password"
                        onClick={() => setResetting(u)}
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon text-muted hover:text-danger"
                        title="Delete"
                        disabled={u.id === me?.id}
                        onClick={() => setDeleting(u)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    Nobody matched that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && (
        <UserReviewPanel userId={reviewing.id} onClose={() => setReviewing(null)} />
      )}

      <UserFormModal
        open={createOpen || !!editing}
        user={editing}
        roles={roles}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditing(null);
          load();
        }}
      />

      <PasswordResetModal
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={() => {
          setResetting(null);
          load();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        message="Their boards memberships, comments and assignments will be removed. This cannot be undone."
        confirmLabel="Delete user"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await del(`/api/admin/users/${deleting.id}`);
            toast({ title: 'User deleted', tone: 'success' });
          } catch (err: any) {
            toast({ title: err.message, tone: 'error' });
          } finally {
            setDeleting(null);
            load();
          }
        }}
      />
    </div>
  );
}

function UserFormModal({
  open,
  user,
  roles,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: any;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setRoleId(user?.roleId ?? roles.find((r) => r.key === 'member')?.id ?? roles[0]?.id ?? '');
    setTitle(user?.title ?? '');
    setColor(user?.avatarColor ?? PRESET_PRIMARIES[Math.floor(Math.random() * 12)].value);
    setMustChange(true);
  }, [open, user, roles]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (user) {
        await patch(`/api/admin/users/${user.id}`, {
          name: name.trim(),
          email: email.trim(),
          roleId,
          title: title.trim() || null,
          avatarColor: color,
        });
        toast({ title: 'User updated', tone: 'success' });
      } else {
        await post('/api/admin/users', {
          name: name.trim(),
          email: email.trim(),
          password,
          roleId,
          title: title.trim() || undefined,
          avatarColor: color,
          mustChangePw: mustChange,
        });
        toast({ title: `${name} can now sign in`, tone: 'success' });
      }
      onSaved();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-md" label="User">
      <ModalHeader
        title={user ? `Edit ${user.name}` : 'Create a user'}
        subtitle={user ? undefined : 'They will be able to sign in straight away'}
        icon={<UserPlus size={18} />}
        onClose={onClose}
      />
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar user={{ name: name || '?', avatarColor: color }} size={44} />
          <div className="flex flex-wrap gap-1.5">
            {PRESET_PRIMARIES.slice(0, 8).map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                style={{ background: c.value }}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform hover:scale-110',
                  color === c.value && 'ring-2 ring-ink ring-offset-1 ring-offset-surface'
                )}
              />
            ))}
          </div>
        </div>

        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Job title" hint="Optional">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {!user && (
          <Field label="Temporary password" hint="At least 6 characters">
            <input
              type="text"
              className="input font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
        )}

        <Field
          label="Role"
          hint={roles.find((r) => r.id === roleId)?.description || 'What they may do across KareMa'}
        >
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>

        {!user && (
          <div className="rounded-md bg-surface2/60 p-3">
            <Switch
              checked={mustChange}
              onChange={setMustChange}
              label="Require a password change"
              description="They will be prompted to pick their own password"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={15} /> : null}
            {user ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordResetModal({
  user,
  onClose,
  onDone,
}: {
  user: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useApp();
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword(Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6));
      setMustChange(true);
    }
  }, [user]);

  if (!user) return null;

  return (
    <Modal open onClose={onClose} width="max-w-sm" label="Reset password">
      <ModalHeader
        title="Reset password"
        subtitle={user.name}
        icon={<KeyRound size={18} />}
        onClose={onClose}
      />
      <div className="space-y-4 p-5">
        <Field label="New password" hint="Copy this and hand it over securely">
          <input
            className="input font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
          />
        </Field>
        <div className="rounded-md bg-surface2/60 p-3">
          <Switch
            checked={mustChange}
            onChange={setMustChange}
            label="Require a password change"
            description="Prompt them to choose their own on next sign-in"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving || password.length < 6}
            onClick={async () => {
              setSaving(true);
              try {
                await post(`/api/admin/users/${user.id}/password`, {
                  password,
                  mustChangePw: mustChange,
                });
                toast({ title: 'Password reset', tone: 'success' });
                onDone();
              } catch (err: any) {
                toast({ title: err.message, tone: 'error' });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Spinner size={15} /> : null}
            Reset password
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- boards */

function BoardsTab() {
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ boards: any[] }>('/api/admin/boards')
      .then((r) => setBoards(r.boards))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/70 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-semibold">Board</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Owner</th>
            <th className="px-4 py-3 font-semibold">Cards</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Members</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">Created</th>
          </tr>
        </thead>
        <tbody>
          {boards.map((b) => (
            <tr key={b.id} className="border-b border-line/40 last:border-0 hover:bg-surface2/50">
              <td className="px-4 py-3">
                <Link to={`/b/${b.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-sm text-xs"
                    style={{ background: `${b.color}26`, color: b.color }}
                  >
                    {b.icon || <SquareKanban size={13} />}
                  </span>
                  <span className="truncate">{b.title}</span>
                  {b.isArchived && <span className="chip bg-surface3/70 text-muted">archived</span>}
                  {b.isPublic && <span className="chip bg-primary/14 text-primary">public</span>}
                </Link>
              </td>
              <td className="hidden px-4 py-3 text-muted sm:table-cell">{b.createdBy?.name}</td>
              <td className="px-4 py-3">{b._count.cards}</td>
              <td className="hidden px-4 py-3 md:table-cell">{b._count.members}</td>
              <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                {formatDate(b.createdAt)}
              </td>
            </tr>
          ))}
          {boards.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                No boards on this instance yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
