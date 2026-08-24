import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CornerDownRight,
  MessageSquare,
  Paperclip,
  Plus,
} from 'lucide-react';
import { patch, post } from '../../lib/api';
import { useApp } from '../../store/app';
import { cn, dueState, formatDate, PRIORITIES } from '../../lib/utils';
import { Avatar, MenuItem, Popover } from '../ui';
import { CardData } from './CardTile';
import { ListData } from './ListColumn';

type Row = {
  card: CardData & { parentId?: string | null; listId?: string };
  listId: string;
  depth: number;
  childCount: number;
};

type SortKey = 'number' | 'title' | 'status' | 'priority' | 'due' | 'assignee';

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'number', label: 'Key', className: 'w-20' },
  { key: 'title', label: 'Summary', className: '' },
  { key: 'status', label: 'Status', className: 'w-40 hidden md:table-cell' },
  { key: 'priority', label: 'Priority', className: 'w-28 hidden lg:table-cell' },
  { key: 'assignee', label: 'Assignee', className: 'w-28 hidden sm:table-cell' },
  { key: 'due', label: 'Due', className: 'w-28 hidden lg:table-cell' },
];

/**
 * A flat, sortable table of every card on the board — the counterpart to the
 * kanban view. Subtasks nest under their parent and can be folded away.
 */
export function BoardListView({
  lists,
  canEdit,
  onOpenCard,
  onChanged,
}: {
  lists: ListData[];
  canEdit: boolean;
  onOpenCard: (id: string) => void;
  onChanged: () => void;
}) {
  const { toast } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'number',
    dir: 'asc',
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  /** Every visible card, paired with the list it sits in. */
  const all = useMemo(() => {
    const out: { card: any; listId: string }[] = [];
    for (const list of lists) for (const card of list.cards) out.push({ card, listId: list.id });
    return out;
  }, [lists]);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(all.map((e) => [e.card.id, e]));
    const childrenOf = new Map<string, typeof all>();
    const roots: typeof all = [];

    for (const entry of all) {
      const parentId = entry.card.parentId;
      // a subtask whose parent is filtered out is shown at the top level
      if (parentId && byId.has(parentId)) {
        const bucket = childrenOf.get(parentId) ?? [];
        bucket.push(entry);
        childrenOf.set(parentId, bucket);
      } else {
        roots.push(entry);
      }
    }

    const compare = (a: any, b: any) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'title':
          return a.card.title.localeCompare(b.card.title) * dir;
        case 'status': {
          const ai = lists.findIndex((l) => l.id === a.listId);
          const bi = lists.findIndex((l) => l.id === b.listId);
          return (ai - bi) * dir;
        }
        case 'priority':
          return (
            ((PRIORITY_ORDER[a.card.priority] ?? 9) - (PRIORITY_ORDER[b.card.priority] ?? 9)) * dir
          );
        case 'due': {
          const av = a.card.dueDate ? new Date(a.card.dueDate).getTime() : Infinity;
          const bv = b.card.dueDate ? new Date(b.card.dueDate).getTime() : Infinity;
          return (av - bv) * dir;
        }
        case 'assignee': {
          const an = a.card.assignees[0]?.user.name ?? '';
          const bn = b.card.assignees[0]?.user.name ?? '';
          if (!an && !bn) return 0;
          if (!an) return 1;
          if (!bn) return -1;
          return an.localeCompare(bn) * dir;
        }
        default:
          return (a.card.number - b.card.number) * dir;
      }
    };

    const out: Row[] = [];
    const walk = (entries: typeof all, depth: number) => {
      for (const entry of [...entries].sort(compare)) {
        const kids = childrenOf.get(entry.card.id) ?? [];
        out.push({ card: entry.card, listId: entry.listId, depth, childCount: kids.length });
        if (kids.length && !collapsed.has(entry.card.id)) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [all, lists, sort, collapsed]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleFold = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const moveToList = async (cardId: string, listId: string) => {
    const target = listById.get(listId);
    try {
      await patch(`/api/cards/${cardId}/move`, { listId, index: target?.cards.length ?? 0 });
      onChanged();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const addCard = async (listId: string) => {
    const title = draft.trim();
    if (!title) {
      setAddingTo(null);
      return;
    }
    try {
      await post('/api/cards', { listId, title });
      setDraft('');
      onChanged();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  if (rows.length === 0) {
    return (
      <div className="glass mx-auto mt-6 max-w-md rounded-xl px-6 py-14 text-center">
        <p className="text-sm font-medium">No cards to show</p>
        <p className="mt-1 text-xs text-muted">
          Nothing on this board matches the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="glass overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line/70 text-left text-[11px] tracking-wide text-muted">
                {COLUMNS.map((col) => (
                  <th key={col.key} className={cn('px-3 py-2.5 font-semibold', col.className)}>
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'flex items-center gap-1 transition-colors hover:text-ink',
                        sort.key === col.key && 'text-primary'
                      )}
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
                <th className="w-24 px-3 py-2.5 font-semibold">Labels</th>
                <th className="w-16 px-3 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const card: any = row.card;
                const list = listById.get(row.listId);
                const priority = PRIORITIES.find((p) => p.value === card.priority);
                const due = dueState(card.dueDate, card.isComplete);
                const folded = collapsed.has(card.id);
                const checklist = (card.checklists ?? []).flatMap((c: any) => c.items);
                const checklistDone = checklist.filter((i: any) => i.isDone).length;

                return (
                  <tr
                    key={card.id}
                    onClick={() => onOpenCard(card.id)}
                    className="group cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-surface2/60"
                  >
                    {/* key */}
                    <td className="px-3 py-2 align-middle">
                      <span className="flex items-center gap-1">
                        {row.childCount > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFold(card.id);
                            }}
                            className="grid h-4 w-4 shrink-0 place-items-center rounded-xs text-muted transition-colors hover:bg-surface3 hover:text-ink"
                            aria-label={folded ? 'Show subtasks' : 'Hide subtasks'}
                          >
                            <ChevronRight
                              size={12}
                              className={cn('transition-transform', !folded && 'rotate-90')}
                            />
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="font-mono text-[11px] text-muted">#{card.number}</span>
                      </span>
                    </td>

                    {/* summary */}
                    <td className="px-3 py-2">
                      <span
                        className="flex min-w-0 items-center gap-2"
                        style={{ paddingLeft: row.depth * 18 }}
                      >
                        {row.depth > 0 && (
                          <CornerDownRight size={12} className="shrink-0 text-muted opacity-60" />
                        )}
                        {card.color && (
                          <span
                            className="h-3 w-1 shrink-0 rounded-full"
                            style={{ background: card.color }}
                          />
                        )}
                        <span
                          className={cn(
                            'truncate font-medium',
                            card.isComplete && 'text-muted line-through'
                          )}
                        >
                          {card.title}
                        </span>

                        <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
                          {row.childCount > 0 && (
                            <span title={`${row.childCount} subtasks`}>{row.childCount} sub</span>
                          )}
                          {checklist.length > 0 && (
                            <span title="Checklist">
                              {checklistDone}/{checklist.length}
                            </span>
                          )}
                          {card._count?.comments > 0 && (
                            <span className="flex items-center gap-0.5">
                              <MessageSquare size={11} />
                              {card._count.comments}
                            </span>
                          )}
                          {card._count?.attachments > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Paperclip size={11} />
                              {card._count.attachments}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>

                    {/* status */}
                    <td className="hidden px-3 py-2 md:table-cell" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <Popover
                          width="w-48"
                          trigger={({ toggle }) => (
                            <button
                              onClick={toggle}
                              className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors hover:bg-surface3"
                              style={{
                                background: list?.color ? `${list.color}22` : undefined,
                                color: list?.color ?? undefined,
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: list?.color ?? 'hsl(var(--muted))' }}
                              />
                              {list?.title ?? '—'}
                            </button>
                          )}
                        >
                          {(close) =>
                            lists.map((l) => (
                              <MenuItem
                                key={l.id}
                                active={l.id === row.listId}
                                icon={
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ background: l.color ?? 'hsl(var(--muted))' }}
                                  />
                                }
                                onClick={() => {
                                  close();
                                  if (l.id !== row.listId) moveToList(card.id, l.id);
                                }}
                              >
                                {l.title}
                              </MenuItem>
                            ))
                          }
                        </Popover>
                      ) : (
                        <span className="text-xs text-muted">{list?.title}</span>
                      )}
                    </td>

                    {/* priority */}
                    <td className="hidden px-3 py-2 lg:table-cell" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <Popover
                          width="w-40"
                          trigger={({ toggle }) => (
                            <button
                              onClick={toggle}
                              className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-surface3"
                              style={{ color: priority?.color }}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: priority?.color }}
                              />
                              {priority?.label}
                            </button>
                          )}
                        >
                          {(close) =>
                            PRIORITIES.map((p) => (
                              <MenuItem
                                key={p.value}
                                active={card.priority === p.value}
                                icon={
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ background: p.color }}
                                  />
                                }
                                onClick={async () => {
                                  close();
                                  await patch(`/api/cards/${card.id}`, { priority: p.value });
                                  onChanged();
                                }}
                              >
                                {p.label}
                              </MenuItem>
                            ))
                          }
                        </Popover>
                      ) : (
                        <span className="text-xs" style={{ color: priority?.color }}>
                          {priority?.label}
                        </span>
                      )}
                    </td>

                    {/* assignees */}
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {card.assignees.length ? (
                        <span className="flex -space-x-1.5">
                          {card.assignees.slice(0, 3).map((a: any) => (
                            <Avatar key={a.user.id} user={a.user} size={22} ring />
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Unassigned</span>
                      )}
                    </td>

                    {/* due */}
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {card.dueDate ? (
                        <span
                          className={cn(
                            'chip',
                            due === 'overdue'
                              ? 'bg-danger/16 text-danger'
                              : due === 'today' || due === 'soon'
                                ? 'bg-warning/16 text-warning'
                                : 'bg-surface3/60 text-muted'
                          )}
                        >
                          {formatDate(card.dueDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>

                    {/* labels */}
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {card.labels.slice(0, 2).map(({ label }: any) => (
                          <span
                            key={label.id}
                            className="chip"
                            style={{ background: `${label.color}2e`, color: label.color }}
                          >
                            {label.name || 'Label'}
                          </span>
                        ))}
                        {card.labels.length > 2 && (
                          <span className="chip bg-surface3/60 text-muted">
                            +{card.labels.length - 2}
                          </span>
                        )}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <span className="text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                        Open
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="border-t border-line/60 px-3 py-2">
            {addingTo ? (
              <div className="flex items-center gap-2">
                <select
                  className="input w-40 py-1.5 text-xs"
                  value={addingTo}
                  onChange={(e) => setAddingTo(e.target.value)}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
                <input
                  autoFocus
                  className="input py-1.5 text-sm"
                  placeholder="Card title — Enter to add"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCard(addingTo);
                    if (e.key === 'Escape') {
                      setAddingTo(null);
                      setDraft('');
                    }
                  }}
                />
                <button className="btn btn-primary py-1 text-xs" onClick={() => addCard(addingTo)}>
                  Add
                </button>
                <button
                  className="btn btn-ghost py-1 text-xs"
                  onClick={() => {
                    setAddingTo(null);
                    setDraft('');
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTo(lists[0]?.id ?? null)}
                disabled={lists.length === 0}
                className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm text-muted transition-colors hover:text-ink"
              >
                <Plus size={15} />
                Add a card
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 px-1 text-[11px] text-muted">
        {rows.length} {rows.length === 1 ? 'card' : 'cards'} · click a row to open it
      </p>
    </div>
  );
}
