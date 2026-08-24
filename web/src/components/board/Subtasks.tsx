import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownRight, GitBranch, Link2Off, Plus, Search, X } from 'lucide-react';
import { del, get, patch, post } from '../../lib/api';
import { useApp } from '../../store/app';
import { cn, dueState, formatDate, PRIORITIES } from '../../lib/utils';
import { Avatar, MenuItem, Popover, Spinner } from '../ui';

type Summary = {
  id: string;
  title: string;
  number: number;
  isComplete: boolean;
  priority: string;
  dueDate?: string | null;
  assignees: { user: any }[];
  labels: { label: any }[];
};

/** The "belongs to" line at the top of a card that has a parent. */
export function ParentBreadcrumb({
  parent,
  canEdit,
  cardId,
  onChanged,
  onOpenCard,
}: {
  parent: Summary;
  canEdit: boolean;
  cardId: string;
  onChanged: () => void;
  onOpenCard?: (id: string) => void;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
      <GitBranch size={12} className="shrink-0" />
      <span className="shrink-0">Subtask of</span>
      <button
        onClick={() => onOpenCard?.(parent.id)}
        className="min-w-0 truncate font-medium text-primary hover:underline"
      >
        #{parent.number} {parent.title}
      </button>
      {canEdit && (
        <button
          title="Detach from the parent"
          className="shrink-0 text-muted transition-colors hover:text-danger"
          onClick={async () => {
            await patch(`/api/cards/${cardId}/parent`, { parentId: null });
            onChanged();
          }}
        >
          <Link2Off size={12} />
        </button>
      )}
    </div>
  );
}

export function Subtasks({
  card,
  canEdit,
  onChanged,
  onOpenCard,
}: {
  card: any;
  canEdit: boolean;
  onChanged: () => void;
  onOpenCard?: (id: string) => void;
}) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const children: Summary[] = card.children ?? [];
  const done = children.filter((c) => c.isComplete).length;

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const add = async () => {
    const value = title.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    setBusy(true);
    try {
      await post(`/api/cards/${card.id}/subtasks`, { title: value });
      setTitle('');
      onChanged();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (children.length === 0 && !adding) {
    if (!canEdit) return null;
    return (
      <section>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <CornerDownRight size={15} />
          Add a subtask
        </button>
      </section>
    );
  }

  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted">
          <CornerDownRight size={15} />
        </span>
        Subtasks
        {children.length > 0 && (
          <span className="ml-1 text-xs font-normal text-muted">
            {done}/{children.length}
          </span>
        )}
      </h3>

      {children.length > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface3">
          <div
            className="h-full rounded-full bg-success transition-[width] duration-300"
            style={{ width: `${(done / children.length) * 100}%` }}
          />
        </div>
      )}

      <div className="mt-2.5 space-y-1">
        {children.map((child) => {
          const priority = PRIORITIES.find((p) => p.value === child.priority);
          const due = dueState(child.dueDate, child.isComplete);
          return (
            <div
              key={child.id}
              className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface2/70"
            >
              <button
                disabled={!canEdit}
                title={child.isComplete ? 'Mark as open' : 'Mark as complete'}
                onClick={async () => {
                  await patch(`/api/cards/${child.id}`, { isComplete: !child.isComplete });
                  onChanged();
                }}
                className={cn(
                  'grid h-4 w-4 shrink-0 place-items-center rounded-xs border-2 transition-colors',
                  child.isComplete
                    ? 'border-success bg-success text-white'
                    : 'border-line hover:border-success'
                )}
              >
                {child.isComplete && <Check size={10} strokeWidth={3} />}
              </button>

              <button
                onClick={() => onOpenCard?.(child.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span
                  className={cn(
                    'block truncate text-[13px]',
                    child.isComplete && 'text-muted line-through'
                  )}
                >
                  <span className="font-mono text-[11px] text-muted">#{child.number}</span>{' '}
                  {child.title}
                </span>
              </button>

              {child.labels?.slice(0, 2).map(({ label }: any) => (
                <span
                  key={label.id}
                  className="chip hidden shrink-0 sm:inline-flex"
                  style={{ background: `${label.color}2e`, color: label.color }}
                >
                  {label.name || 'Label'}
                </span>
              ))}

              {priority && priority.value !== 'NONE' && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: priority.color }}
                  title={`${priority.label} priority`}
                />
              )}

              {child.dueDate && (
                <span
                  className={cn(
                    'chip shrink-0',
                    due === 'overdue' ? 'bg-danger/16 text-danger' : 'bg-surface3/60 text-muted'
                  )}
                >
                  {formatDate(child.dueDate)}
                </span>
              )}

              <span className="flex shrink-0 -space-x-1.5">
                {child.assignees?.slice(0, 2).map((a: any) => (
                  <Avatar key={a.user.id} user={a.user} size={20} ring />
                ))}
              </span>

              {canEdit && (
                <button
                  title="Detach this subtask"
                  className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  onClick={async () => {
                    await patch(`/api/cards/${child.id}/parent`, { parentId: null });
                    onChanged();
                  }}
                >
                  <Link2Off size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit &&
        (adding ? (
          <div className="mt-2 flex gap-1.5">
            <input
              ref={inputRef}
              className="input py-1.5 text-sm"
              placeholder="Subtask title — Enter to add"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setTitle('');
                }
              }}
            />
            <button className="btn btn-primary py-1 text-xs" onClick={add} disabled={busy}>
              {busy ? <Spinner size={13} /> : null}
              Add
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => {
                setAdding(false);
                setTitle('');
              }}
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-1.5 flex items-center gap-1.5 rounded-sm px-1 py-1 text-xs text-muted transition-colors hover:text-ink"
          >
            <Plus size={13} /> Add a subtask
          </button>
        ))}
    </section>
  );
}

/** Quick-action button that attaches this card underneath another one. */
export function ParentPicker({
  card,
  onChanged,
}: {
  card: any;
  onChanged: () => void;
}) {
  const { toast } = useApp();
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const load = async (open: boolean) => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await get<{ cards: any[] }>(`/api/cards/${card.id}/parent-options`);
      setOptions(res.cards);
    } finally {
      setLoading(false);
    }
  };

  const filtered = options.filter((o) =>
    `#${o.number} ${o.title}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Popover
      width="w-72"
      onOpenChange={load}
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <GitBranch size={14} /> Parent
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="relative mb-1.5">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              className="input py-1.5 pl-7 text-xs"
              placeholder="Find a card..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {card.parentId && (
            <>
              <MenuItem
                icon={<Link2Off size={14} />}
                danger
                onClick={async () => {
                  await patch(`/api/cards/${card.id}/parent`, { parentId: null });
                  close();
                  onChanged();
                }}
              >
                Detach from parent
              </MenuItem>
              <div className="divider my-1.5" />
            </>
          )}

          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6 text-muted">
                <Spinner size={16} />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                No other card on this board can be its parent.
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  onClick={async () => {
                    try {
                      await patch(`/api/cards/${card.id}/parent`, { parentId: o.id });
                      close();
                      onChanged();
                    } catch (err: any) {
                      toast({ title: err.message, tone: 'error' });
                    }
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface3/60',
                    card.parentId === o.id && 'bg-primary/12'
                  )}
                >
                  <span className="shrink-0 font-mono text-[11px] text-muted">#{o.number}</span>
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  {card.parentId === o.id && <Check size={14} className="text-primary" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
