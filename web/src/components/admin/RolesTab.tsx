import { useEffect, useState } from 'react';
import { Lock, Plus, Shield, Trash2, Users } from 'lucide-react';
import { del, get, patch, post, put } from '../../lib/api';
import { useApp } from '../../store/app';
import { cn } from '../../lib/utils';
import { PRESET_PRIMARIES } from '../../lib/theme';
import { ConfirmDialog, Field, Modal, ModalHeader, Spinner, Switch } from '../ui';

export type Role = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  color: string;
  isSystem: boolean;
  rank: number;
  permissions: Record<string, boolean>;
  _count: { users: number };
};

type PermissionInfo = { key: string; label: string; description: string };

export function RolesTab() {
  const { toast, refreshUser } = useApp();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await get<{ roles: Role[]; catalog: PermissionInfo[] }>('/api/admin/roles');
      setRoles(res.roles);
      setCatalog(res.catalog);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          A role decides what someone may do across the whole instance. Board membership is
          separate — that is set per board.
        </p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          New role
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => {
          const granted = catalog.filter((p) => role.permissions[p.key]);
          return (
            <div key={role.id} className="glass glass-sheen flex flex-col rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                  style={{ background: `${role.color}22`, color: role.color }}
                >
                  <Shield size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    {role.name}
                    {role.isSystem && (
                      <span
                        className="chip bg-surface3/70 text-[10px] text-muted"
                        title="Built in — it can be edited but not deleted"
                      >
                        <Lock size={9} /> built-in
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {role.description || 'No description.'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                  <Users size={12} />
                  {role._count.users}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {granted.length === 0 ? (
                  <span className="chip bg-surface3/60 text-muted">No extra permissions</span>
                ) : (
                  granted.map((p) => (
                    <span
                      key={p.key}
                      className="chip bg-primary/12 text-primary"
                      title={p.description}
                    >
                      {p.label}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-auto flex gap-1.5 pt-3">
                <button className="btn btn-subtle py-1 text-xs" onClick={() => setEditing(role)}>
                  Edit
                </button>
                {!role.isSystem && (
                  <button
                    className="btn btn-ghost py-1 text-xs text-muted hover:text-danger"
                    onClick={() => setDeleting(role)}
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <RoleFormModal
        open={creating || !!editing}
        role={editing}
        catalog={catalog}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await load();
          // your own permissions may have just changed
          refreshUser().catch(() => undefined);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete the ${deleting?.name} role?`}
        message={
          deleting?._count.users
            ? `${deleting._count.users} ${
                deleting._count.users === 1 ? 'person' : 'people'
              } will be moved to the Member role.`
            : 'Nobody currently holds this role.'
        }
        confirmLabel="Delete role"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            const res = await del<{ moved: number; movedTo: { name: string } }>(
              `/api/admin/roles/${deleting!.id}`
            );
            toast({
              title: 'Role deleted',
              description: res.moved
                ? `${res.moved} moved to ${res.movedTo.name}`
                : undefined,
              tone: 'success',
            });
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

function RoleFormModal({
  open,
  role,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean;
  role: Role | null;
  catalog: PermissionInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setColor(role?.color ?? '#6366f1');
    setPermissions({ ...(role?.permissions ?? {}) });
  }, [open, role]);

  const toggle = (key: string) =>
    setPermissions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) delete next[key];
      // anything in the admin area implies being able to open it
      const needsPanel = ['users.manage', 'roles.manage', 'reports.view', 'labels.manage'];
      if (needsPanel.some((k) => next[k])) next['admin.access'] = true;
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        permissions,
      };
      if (role) await patch(`/api/admin/roles/${role.id}`, body);
      else await post('/api/admin/roles', body);
      toast({ title: role ? 'Role updated' : 'Role created', tone: 'success' });
      onSaved();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-lg" label="Role">
      <ModalHeader
        title={role ? `Edit ${role.name}` : 'Create a role'}
        subtitle={
          role?.isSystem
            ? 'This is a built-in role — you can retune it, but it cannot be deleted'
            : 'Pick the permissions people with this role should have'
        }
        icon={<Shield size={18} />}
        onClose={onClose}
      />

      <form onSubmit={submit} className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
            style={{ background: `${color}22`, color }}
          >
            <Shield size={20} />
          </span>
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

        <Field label="Role name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Producer"
            required
            autoFocus
          />
        </Field>

        <Field label="Description" hint="Optional — shown on the roles list">
          <textarea
            className="input resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this role for?"
          />
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Permissions</p>
          <div className="space-y-1">
            {catalog.map((p) => (
              <div
                key={p.key}
                className={cn(
                  'rounded-md px-3 py-2.5 transition-colors',
                  permissions[p.key] ? 'bg-primary/8' : 'bg-surface2/50'
                )}
              >
                <Switch
                  checked={!!permissions[p.key]}
                  onChange={() => toggle(p.key)}
                  label={p.label}
                  description={p.description}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? <Spinner size={15} /> : null}
            {role ? 'Save role' : 'Create role'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ label presets */

export function LabelPresetsCard() {
  const { toast } = useApp();
  const [presets, setPresets] = useState<{ name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get<{ presets: any[] }>('/api/admin/label-presets')
      .then((r) => setPresets(r.presets))
      .finally(() => setLoading(false));
  }, []);

  const save = async (next: { name: string; color: string }[]) => {
    setPresets(next);
    setSaving(true);
    try {
      await put('/api/admin/label-presets', { presets: next });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="skeleton h-48" />;

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Label presets</h3>
          <p className="mt-0.5 text-xs text-muted">
            The labels every new board starts with. Existing boards are left alone.
          </p>
        </div>
        {saving && <Spinner size={14} />}
      </div>

      <div className="space-y-1.5">
        {presets.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="color"
              value={label.color}
              onChange={(e) => {
                const next = [...presets];
                next[i] = { ...next[i], color: e.target.value };
                save(next);
              }}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-line bg-transparent"
            />
            <input
              className="input py-1.5 text-sm"
              value={label.name}
              placeholder="Label name"
              onChange={(e) => {
                const next = [...presets];
                next[i] = { ...next[i], name: e.target.value };
                setPresets(next);
              }}
              onBlur={() => save(presets)}
            />
            <button
              className="btn btn-ghost btn-icon shrink-0 text-muted hover:text-danger"
              onClick={() => save(presets.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${label.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn btn-subtle mt-3 py-1 text-xs"
        onClick={() => save([...presets, { name: 'New label', color: '#6366f1' }])}
        disabled={presets.length >= 30}
      >
        <Plus size={14} />
        Add a preset
      </button>
    </div>
  );
}
