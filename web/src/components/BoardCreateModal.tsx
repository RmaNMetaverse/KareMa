import { useEffect, useState } from 'react';
import { SquareKanban } from 'lucide-react';
import { post } from '../lib/api';
import { useApp } from '../store/app';
import { BOARD_ICONS, cn } from '../lib/utils';
import { PRESET_PRIMARIES } from '../lib/theme';
import { Field, Modal, ModalHeader, Spinner, Switch } from './ui';

export function BoardCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (board: any) => void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('📋');
  const [starter, setStarter] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setColor('#6366f1');
      setIcon('📋');
      setStarter(true);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    let created: any = null;
    try {
      const res = await post<{ board: any }>('/api/boards', {
        title: title.trim(),
        description: description.trim() || undefined,
        color,
        icon,
        withStarterLists: starter,
      });
      created = res?.board ?? null;
    } catch (err: any) {
      toast({ title: 'Could not create the board', description: err.message, tone: 'error' });
      setSaving(false);
      return;
    }
    setSaving(false);

    // The board exists from here on. Close first, so that anything the parent
    // does next -- reloading a list, navigating -- cannot strand this modal
    // open and make a successful create look like a failure.
    onClose();
    toast({ title: 'Board created', tone: 'success' });
    if (created) onCreated(created);
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-lg" label="Create board">
      <ModalHeader
        title="Create a board"
        subtitle="Boards hold your lists and cards"
        icon={<SquareKanban size={18} />}
        onClose={onClose}
      />
      <form onSubmit={submit} className="space-y-4 p-5">
        <div
          className="flex h-24 items-center gap-3 rounded-lg px-4"
          style={{ background: `linear-gradient(135deg, ${color}dd, ${color}66)` }}
        >
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/20 text-2xl backdrop-blur">
            {icon}
          </span>
          <span className="truncate text-lg font-bold text-white drop-shadow">
            {title || 'Untitled board'}
          </span>
        </div>

        <Field label="Board title">
          <input
            className="input input-lg"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Game Production"
            autoFocus
            maxLength={120}
          />
        </Field>

        <Field label="Description" hint="Optional">
          <textarea
            className="input resize-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this board for?"
            maxLength={1000}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Colour</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_PRIMARIES.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
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
            {BOARD_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-sm text-base transition-colors',
                  icon === emoji ? 'bg-primary/18 ring-1 ring-primary/50' : 'hover:bg-surface3/70'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md bg-surface2/60 p-3">
          <Switch
            checked={starter}
            onChange={setStarter}
            label="Add starter lists"
            description="Backlog, In Progress, In Review, Done"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || saving}>
            {saving ? <Spinner size={15} /> : null}
            Create board
          </button>
        </div>
      </form>
    </Modal>
  );
}
