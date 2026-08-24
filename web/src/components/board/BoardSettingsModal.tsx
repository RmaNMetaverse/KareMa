import { useEffect, useState } from 'react';
import { Palette, Plus, Settings2, Tag, Trash2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { del, get, patch, post } from '../../lib/api';
import { useApp } from '../../store/app';
import { BOARD_ICONS, cn } from '../../lib/utils';
import { PRESET_PRIMARIES } from '../../lib/theme';
import { Avatar, ConfirmDialog, Field, Modal, ModalHeader, Switch } from '../ui';

const TABS = [
  { id: 'general', label: 'General', icon: <Settings2 size={15} /> },
  { id: 'members', label: 'Members', icon: <Users size={15} /> },
  { id: 'labels', label: 'Labels', icon: <Tag size={15} /> },
] as const;

const ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

export function BoardSettingsModal({
  board,
  onClose,
  onChanged,
}: {
  board: any;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast, user } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general');
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description || '');
  const [color, setColor] = useState(board.color);
  const [icon, setIcon] = useState(board.icon || '📋');
  const [isPublic, setIsPublic] = useState(board.isPublic);
  const [directory, setDirectory] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: '', color: '#6366f1' });

  useEffect(() => {
    get<{ users: any[] }>('/api/users')
      .then((r) => setDirectory(r.users))
      .catch(() => undefined);
  }, []);

  const saveGeneral = async () => {
    try {
      await patch(`/api/boards/${board.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        color,
        icon,
        isPublic,
      });
      toast({ title: 'Board updated', tone: 'success' });
      onChanged();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const memberIds = new Set(board.members.map((m: any) => m.userId));
  const candidates = directory.filter((u) => !memberIds.has(u.id));

  return (
    <Modal open onClose={onClose} width="max-w-2xl" label="Board settings">
      <ModalHeader
        title="Board settings"
        subtitle={board.title}
        icon={<Settings2 size={18} />}
        onClose={onClose}
      />

      <div className="flex gap-1 border-b border-line/70 px-4 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-[65vh] overflow-y-auto p-5">
        {tab === 'general' && (
          <div className="space-y-4">
            <Field label="Board title">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea
                className="input resize-none"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Palette size={13} /> Colour
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_PRIMARIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    style={{ background: c.value }}
                    className={cn(
                      'h-7 w-7 rounded-full transition-transform hover:scale-110',
                      color === c.value && 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
                    )}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Icon</p>
              <div className="flex flex-wrap gap-1">
                {BOARD_ICONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setIcon(e)}
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-sm text-base transition-colors',
                      icon === e ? 'bg-primary/18 ring-1 ring-primary/50' : 'hover:bg-surface3/70'
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md bg-surface2/60 p-3">
              <Switch
                checked={isPublic}
                onChange={setIsPublic}
                label="Visible to everyone"
                description="Any signed-in user can view this board, even without being a member"
              />
            </div>

            <div className="flex justify-between pt-1">
              {(board.myRole === 'OWNER' || user?.permissions?.['boards.deleteAny']) && (
                <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} /> Delete board
                </button>
              )}
              <button className="btn btn-primary ml-auto" onClick={saveGeneral}>
                Save changes
              </button>
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                On this board
              </p>
              <div className="space-y-1.5">
                {board.members.map((m: any) => (
                  <div
                    key={m.userId}
                    className="flex items-center gap-3 rounded-md bg-surface2/60 px-3 py-2"
                  >
                    <Avatar user={m.user} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.user.name}</p>
                      <p className="truncate text-xs text-muted">{m.user.email}</p>
                    </div>
                    {m.role === 'OWNER' ? (
                      <span className="chip bg-primary/14 text-primary">Owner</span>
                    ) : (
                      <>
                        <select
                          className="input w-28 py-1 text-xs"
                          value={m.role}
                          onChange={async (e) => {
                            await patch(`/api/boards/${board.id}/members/${m.userId}`, {
                              role: e.target.value,
                            });
                            onChanged();
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.charAt(0) + r.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-ghost btn-icon text-muted hover:text-danger"
                          onClick={async () => {
                            await del(`/api/boards/${board.id}/members/${m.userId}`);
                            onChanged();
                          }}
                          aria-label="Remove"
                        >
                          <X size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Add someone
              </p>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted">Everyone is already on this board.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {candidates.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface2/60">
                      <Avatar user={u} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{u.name}</p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                      <button
                        className="btn btn-subtle py-1 text-xs"
                        onClick={async () => {
                          await post(`/api/boards/${board.id}/members`, {
                            userId: u.id,
                            role: 'MEMBER',
                          });
                          toast({ title: `${u.name} added`, tone: 'success' });
                          onChanged();
                        }}
                      >
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'labels' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {board.labels.map((l: any) => (
                <div key={l.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={l.color}
                    onChange={async (e) => {
                      await patch(`/api/boards/${board.id}/labels/${l.id}`, {
                        color: e.target.value,
                      });
                      onChanged();
                    }}
                    className="h-8 w-10 cursor-pointer rounded-sm border border-line bg-transparent"
                  />
                  <input
                    className="input py-1.5 text-sm"
                    defaultValue={l.name}
                    placeholder="Label name"
                    onBlur={async (e) => {
                      if (e.target.value !== l.name) {
                        await patch(`/api/boards/${board.id}/labels/${l.id}`, {
                          name: e.target.value,
                        });
                        onChanged();
                      }
                    }}
                  />
                  <button
                    className="btn btn-ghost btn-icon text-muted hover:text-danger"
                    onClick={async () => {
                      await del(`/api/boards/${board.id}/labels/${l.id}`);
                      onChanged();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-line/60 pt-4">
              <input
                type="color"
                value={newLabel.color}
                onChange={(e) => setNewLabel((s) => ({ ...s, color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded-sm border border-line bg-transparent"
              />
              <input
                className="input py-1.5 text-sm"
                placeholder="New label name"
                value={newLabel.name}
                onChange={(e) => setNewLabel((s) => ({ ...s, name: e.target.value }))}
              />
              <button
                className="btn btn-primary py-1.5 text-xs"
                onClick={async () => {
                  await post(`/api/boards/${board.id}/labels`, newLabel);
                  setNewLabel({ name: '', color: '#6366f1' });
                  onChanged();
                }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this board?"
        message="Every list, card, comment and attachment on this board will be permanently removed."
        confirmLabel="Delete board"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await del(`/api/boards/${board.id}`);
          toast({ title: 'Board deleted', tone: 'success' });
          navigate('/');
        }}
      />
    </Modal>
  );
}
