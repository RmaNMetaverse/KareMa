import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Filter,
  Plus,
  Rows3,
  Settings2,
  SlidersHorizontal,
  Star,
  Tag,
  Trello,
  Users,
  X,
} from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useApp } from '../store/app';
import { cn, PRIORITIES } from '../lib/utils';
import { withBase } from '../lib/base';
import { Avatar, ConfirmDialog, MenuItem, Popover, Spinner } from '../components/ui';
import { CardData, CardTileGhost } from '../components/board/CardTile';
import { ListColumn, ListData } from '../components/board/ListColumn';
import { CardModal } from '../components/board/CardModal';
import { BoardSettingsModal } from '../components/board/BoardSettingsModal';
import { BoardListView } from '../components/board/BoardListView';

type BoardMember = {
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; avatarColor: string; avatarUrl?: string | null };
};

type BoardData = {
  id: string;
  title: string;
  description?: string | null;
  color: string;
  background?: string | null;
  icon?: string | null;
  isPublic: boolean;
  starred: boolean;
  myRole: string;
  canEdit: boolean;
  canManage: boolean;
  members: BoardMember[];
  labels: { id: string; name: string; color: string }[];
  lists: ListData[];
};

type Filters = {
  text: string;
  members: string[];
  labels: string[];
  priorities: string[];
  due: 'any' | 'overdue' | 'week' | 'none';
  hideComplete: boolean;
};

const EMPTY_FILTERS: Filters = {
  text: '',
  members: [],
  labels: [],
  priorities: [],
  due: 'any',
  hideComplete: false,
};

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, user } = useApp();

  const [board, setBoard] = useState<BoardData | null>(null);
  const [lists, setLists] = useState<ListData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [activeList, setActiveList] = useState<ListData | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [compactLabels, setCompactLabels] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return (localStorage.getItem(`karema.view.${boardId}`) as 'board' | 'list') || 'board';
    } catch {
      return 'board';
    }
  });

  const switchView = (next: 'board' | 'list') => {
    setView(next);
    try {
      localStorage.setItem(`karema.view.${boardId}`, next);
    } catch {
      /* private mode */
    }
  };

  const openCardId = searchParams.get('card');
  const dragOriginRef = useRef<{ listId: string; index: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /* ------------------------------------------------------------------ load */

  const load = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await get<{ board: BoardData }>(`/api/boards/${boardId}`);
      setBoard(res.board);
      setLists(res.board.lists);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not open this board');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  /* -------------------------------------------------------------- realtime */

  useEffect(() => {
    if (!boardId) return;
    const socket = getSocket();
    socket.emit('board:join', boardId);

    const upsertCard = (card: CardData & { listId: string }) => {
      setLists((prev) =>
        prev.map((l) => {
          const without = l.cards.filter((c) => c.id !== card.id);
          if (l.id !== card.listId) return { ...l, cards: without };
          const exists = l.cards.some((c) => c.id === card.id);
          return {
            ...l,
            cards: exists
              ? l.cards.map((c) => (c.id === card.id ? { ...c, ...card } : c))
              : [...without, card],
          };
        })
      );
    };

    const onCardCreated = (card: any) => upsertCard(card);
    const onCardUpdated = (card: any) => upsertCard(card);
    const onCardMoved = (payload: any) => upsertCard(payload.card);
    const onCardDeleted = (payload: { id: string }) =>
      setLists((prev) => prev.map((l) => ({ ...l, cards: l.cards.filter((c) => c.id !== payload.id) })));
    const onListCreated = (list: any) =>
      setLists((prev) => (prev.some((l) => l.id === list.id) ? prev : [...prev, { ...list, cards: [] }]));
    const onListUpdated = (list: any) =>
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, ...list, cards: l.cards } : l)));
    const onListDeleted = (payload: { id: string }) =>
      setLists((prev) => prev.filter((l) => l.id !== payload.id));
    const onRefresh = () => load();

    socket.on('card:created', onCardCreated);
    socket.on('card:updated', onCardUpdated);
    socket.on('card:moved', onCardMoved);
    socket.on('card:deleted', onCardDeleted);
    socket.on('list:created', onListCreated);
    socket.on('list:updated', onListUpdated);
    socket.on('list:moved', onRefresh);
    socket.on('list:deleted', onListDeleted);
    socket.on('list:cards-archived', onRefresh);
    socket.on('board:refresh', onRefresh);
    socket.on('board:updated', (b: any) => setBoard((prev) => (prev ? { ...prev, ...b } : prev)));
    socket.on('label:created', onRefresh);
    socket.on('label:updated', onRefresh);
    socket.on('label:deleted', onRefresh);
    socket.on('member:added', onRefresh);
    socket.on('member:removed', onRefresh);

    return () => {
      socket.emit('board:leave', boardId);
      socket.off('card:created', onCardCreated);
      socket.off('card:updated', onCardUpdated);
      socket.off('card:moved', onCardMoved);
      socket.off('card:deleted', onCardDeleted);
      socket.off('list:created', onListCreated);
      socket.off('list:updated', onListUpdated);
      socket.off('list:moved', onRefresh);
      socket.off('list:deleted', onListDeleted);
      socket.off('list:cards-archived', onRefresh);
      socket.off('board:refresh', onRefresh);
      socket.off('board:updated');
      socket.off('label:created', onRefresh);
      socket.off('label:updated', onRefresh);
      socket.off('label:deleted', onRefresh);
      socket.off('member:added', onRefresh);
      socket.off('member:removed', onRefresh);
    };
  }, [boardId, load]);

  /* --------------------------------------------------------------- filters */

  const filtered = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    const now = Date.now();
    return lists.map((list) => ({
      ...list,
      cards: list.cards.filter((card) => {
        if (text && !card.title.toLowerCase().includes(text)) {
          const inDesc = card.description?.toLowerCase().includes(text);
          if (!inDesc) return false;
        }
        if (filters.hideComplete && card.isComplete) return false;
        if (filters.members.length) {
          const ids = card.assignees.map((a) => a.user.id);
          if (!filters.members.some((m) => ids.includes(m))) return false;
        }
        if (filters.labels.length) {
          const ids = card.labels.map((l) => l.label.id);
          if (!filters.labels.some((l) => ids.includes(l))) return false;
        }
        if (filters.priorities.length && !filters.priorities.includes(card.priority)) return false;
        if (filters.due !== 'any') {
          if (filters.due === 'none' && card.dueDate) return false;
          if (filters.due === 'overdue') {
            if (!card.dueDate || new Date(card.dueDate).getTime() >= now || card.isComplete)
              return false;
          }
          if (filters.due === 'week') {
            if (!card.dueDate) return false;
            const diff = new Date(card.dueDate).getTime() - now;
            if (diff < 0 || diff > 7 * 86400000) return false;
          }
        }
        return true;
      }),
    }));
  }, [lists, filters]);

  const filterCount =
    filters.members.length +
    filters.labels.length +
    filters.priorities.length +
    (filters.due !== 'any' ? 1 : 0) +
    (filters.hideComplete ? 1 : 0) +
    (filters.text ? 1 : 0);

  const filtersActive = filterCount > 0;

  /* ------------------------------------------------------------ drag & drop */

  const findList = (cardId: string) => lists.find((l) => l.cards.some((c) => c.id === cardId));

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as any;
    if (data?.type === 'card') {
      setActiveCard(data.card);
      const list = findList(data.card.id);
      dragOriginRef.current = list
        ? { listId: list.id, index: list.cards.findIndex((c) => c.id === data.card.id) }
        : null;
    } else if (data?.type === 'list') {
      setActiveList(data.list);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as any;
    if (activeData?.type !== 'card') return;

    const overData = over.data.current as any;
    const activeListId = findList(String(active.id))?.id;
    let overListId: string | undefined;

    if (overData?.type === 'card') overListId = findList(String(over.id))?.id;
    else if (overData?.type === 'list-drop') overListId = overData.listId;
    else if (String(over.id).startsWith('list:')) overListId = String(over.id).slice(5);

    if (!activeListId || !overListId || activeListId === overListId) return;

    setLists((prev) => {
      const from = prev.find((l) => l.id === activeListId);
      const card = from?.cards.find((c) => c.id === active.id);
      if (!card) return prev;

      const overIndex =
        overData?.type === 'card'
          ? prev.find((l) => l.id === overListId)!.cards.findIndex((c) => c.id === over.id)
          : prev.find((l) => l.id === overListId)!.cards.length;

      return prev.map((l) => {
        if (l.id === activeListId) return { ...l, cards: l.cards.filter((c) => c.id !== active.id) };
        if (l.id === overListId) {
          const next = [...l.cards];
          next.splice(overIndex < 0 ? next.length : overIndex, 0, card);
          return { ...l, cards: next };
        }
        return l;
      });
    });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as any;
    setActiveCard(null);
    setActiveList(null);
    if (!over) {
      dragOriginRef.current = null;
      return;
    }

    /* ---- reordering lists ---- */
    if (activeData?.type === 'list') {
      const activeId = String(active.id);
      const overId = String(over.id).startsWith('list:')
        ? String(over.id)
        : `list:${(over.data.current as any)?.listId ?? ''}`;
      if (activeId === overId) return;

      const oldIndex = lists.findIndex((l) => `list:${l.id}` === activeId);
      const newIndex = lists.findIndex((l) => `list:${l.id}` === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const next = arrayMove(lists, oldIndex, newIndex);
      setLists(next);
      try {
        await patch(`/api/lists/${activeData.list.id}/move`, { index: newIndex });
      } catch (err: any) {
        toast({ title: 'Could not move the list', description: err.message, tone: 'error' });
        load();
      }
      return;
    }

    /* ---- moving cards ---- */
    if (activeData?.type === 'card') {
      const cardId = String(active.id);
      const targetList = findList(cardId);
      if (!targetList) {
        dragOriginRef.current = null;
        return;
      }

      let index = targetList.cards.findIndex((c) => c.id === cardId);
      const overData = over.data.current as any;

      // reorder inside the same list
      if (overData?.type === 'card' && findList(String(over.id))?.id === targetList.id) {
        const overIndex = targetList.cards.findIndex((c) => c.id === over.id);
        if (overIndex !== index && overIndex >= 0) {
          const reordered = arrayMove(targetList.cards, index, overIndex);
          setLists((prev) =>
            prev.map((l) => (l.id === targetList.id ? { ...l, cards: reordered } : l))
          );
          index = overIndex;
        }
      }

      const origin = dragOriginRef.current;
      dragOriginRef.current = null;
      if (origin && origin.listId === targetList.id && origin.index === index) return;

      try {
        await patch(`/api/cards/${cardId}/move`, { listId: targetList.id, index });
      } catch (err: any) {
        toast({ title: 'Could not move the card', description: err.message, tone: 'error' });
        load();
      }
    }
  };

  /* ----------------------------------------------------------- list actions */

  const addCard = async (listId: string, title: string, atTop: boolean) => {
    try {
      await post('/api/cards', { listId, title, index: atTop ? 0 : undefined });
    } catch (err: any) {
      toast({ title: 'Could not add the card', description: err.message, tone: 'error' });
    }
  };

  const addList = async () => {
    const title = newListTitle.trim();
    if (!title) {
      setAddingList(false);
      return;
    }
    try {
      await post(`/api/boards/${boardId}/lists`, { title });
      setNewListTitle('');
    } catch (err: any) {
      toast({ title: 'Could not add the list', description: err.message, tone: 'error' });
    }
  };

  const updateList = async (listId: string, data: Record<string, unknown>) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, ...data } : l)));
    try {
      await patch(`/api/lists/${listId}`, data);
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
      load();
    }
  };

  const deleteList = async (listId: string) => {
    setConfirmDeleteList(null);
    try {
      await del(`/api/lists/${listId}`);
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const toggleStar = async () => {
    try {
      const res = await post<{ starred: boolean }>(`/api/boards/${boardId}/star`);
      setBoard((prev) => (prev ? { ...prev, starred: res.starred } : prev));
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const openCard = (cardId: string) => {
    searchParams.set('card', cardId);
    setSearchParams(searchParams, { replace: false });
  };
  const closeCard = () => {
    searchParams.delete('card');
    setSearchParams(searchParams, { replace: true });
  };

  /* ----------------------------------------------------------------- render */

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted">
        <Spinner size={24} />
      </div>
    );
  }
  if (error || !board) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h2 className="text-lg font-semibold">{error || 'Board not found'}</h2>
        <p className="mt-2 text-sm text-muted">
          It may have been deleted, or you may not have access to it.
        </p>
      </div>
    );
  }

  const canEdit = board.canEdit;

  return (
    <div className="relative isolate flex h-[calc(100vh-3.5rem)] flex-col">
      {/* --------------------------------------------------- background picture */}
      {board.background && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url("${withBase(board.background)}")`,
              // a blur samples from beyond the element, so the layer is grown
              // past its box to stop the edges fading out
              filter: 'blur(var(--board-blur, 24px))',
              transform: 'scale(1.15)',
            }}
          />
          {/* keeps list and card text readable over any photo */}
          <div className="absolute inset-0 bg-bg/60" />
        </div>
      )}

      {/* ------------------------------------------------------- board header */}
      <div className="glass flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-base"
          style={{ background: `${board.color}26`, color: board.color }}
        >
          {board.icon || '📋'}
        </span>
        <h1 className="min-w-0 truncate text-[15px] font-bold tracking-tight">{board.title}</h1>

        <button
          onClick={toggleStar}
          className="btn btn-ghost btn-icon shrink-0"
          aria-label="Star board"
        >
          <Star size={16} className={board.starred ? 'fill-warning text-warning' : ''} />
        </button>

        <div className="ml-1 flex items-center -space-x-2">
          {board.members.slice(0, 5).map((m) => (
            <Avatar key={m.userId} user={m.user} size={26} ring />
          ))}
          {board.members.length > 5 && (
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-surface3 text-[10px] font-semibold ring-2 ring-surface">
              +{board.members.length - 5}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative hidden sm:block">
            <input
              value={filters.text}
              onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
              placeholder="Filter cards..."
              className="input w-44 py-1.5 pl-3 pr-7 text-xs"
            />
            {filters.text && (
              <button
                onClick={() => setFilters((f) => ({ ...f, text: '' }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex rounded-md border border-line p-0.5">
            {([
              ['board', 'Board', <Trello size={14} key="b" />],
              ['list', 'List', <Rows3 size={14} key="l" />],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => switchView(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors',
                  view === id ? 'bg-primary/16 text-primary' : 'text-muted hover:text-ink'
                )}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <FilterMenu
            board={board}
            filters={filters}
            setFilters={setFilters}
            count={filterCount}
            compactLabels={compactLabels}
            setCompactLabels={setCompactLabels}
          />

          {board.canManage && (
            <button
              className="btn btn-subtle"
              onClick={() => setSettingsOpen(true)}
              title="Board settings"
            >
              <Settings2 size={15} />
              <span className="hidden sm:inline">Board</span>
            </button>
          )}
        </div>
      </div>

      {filtersActive && (
        <div className="flex items-center gap-2 border-b border-line/60 bg-primary/8 px-4 py-1.5 text-xs">
          <Filter size={13} className="text-primary" />
          <span className="text-primary">
            {filtered.reduce((n, l) => n + l.cards.length, 0)} of{' '}
            {lists.reduce((n, l) => n + l.cards.length, 0)} cards shown
          </span>
          <button
            className="ml-auto text-primary underline-offset-2 hover:underline"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- the list */}
      {view === 'list' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BoardListView
            lists={filtered}
            canEdit={canEdit}
            onOpenCard={openCard}
            onChanged={load}
          />
        </div>
      ) : (
      /* --------------------------------------------------------- the board */
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveCard(null);
          setActiveList(null);
          dragOriginRef.current = null;
        }}
      >
        <div className="scroll-x min-h-0 flex-1 px-4 py-4">
          <div className="flex h-full items-start gap-3">
            <SortableContext
              items={filtered.map((l) => `list:${l.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {filtered.map((list) => (
                <div key={list.id} className="group">
                  <ListColumn
                    list={list}
                    canEdit={canEdit}
                    compactLabels={compactLabels}
                    onOpenCard={openCard}
                    onAddCard={addCard}
                    onRename={(id, title) => updateList(id, { title })}
                    onSetColor={(id, color) => updateList(id, { color })}
                    onSetWip={(id, wipLimit) => updateList(id, { wipLimit })}
                    onDuplicate={async (id) => {
                      await post(`/api/lists/${id}/duplicate`);
                      load();
                    }}
                    onArchiveCards={async (id) => {
                      await post(`/api/lists/${id}/archive-cards`);
                      load();
                    }}
                    onDelete={(id) => setConfirmDeleteList(id)}
                  />
                </div>
              ))}
            </SortableContext>

            {canEdit && (
              <div className="w-[18.5rem] shrink-0">
                {addingList ? (
                  <div className="glass animate-scale-in rounded-xl p-2.5">
                    <input
                      autoFocus
                      value={newListTitle}
                      onChange={(e) => setNewListTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addList();
                        if (e.key === 'Escape') {
                          setAddingList(false);
                          setNewListTitle('');
                        }
                      }}
                      placeholder="List title"
                      className="input py-1.5 text-sm"
                    />
                    <div className="mt-2 flex gap-1.5">
                      <button className="btn btn-primary py-1 text-xs" onClick={addList}>
                        Add list
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => {
                          setAddingList(false);
                          setNewListTitle('');
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingList(true)}
                    className="glass glass-hover flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:text-ink"
                  >
                    <Plus size={16} />
                    Add another list
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' }}>
          {activeCard ? (
            <CardTileGhost card={activeCard} />
          ) : activeList ? (
            <div className="drag-overlay glass w-[18.5rem] rounded-xl p-3 text-sm font-semibold">
              {activeList.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {openCardId && (
        <CardModal
          cardId={openCardId}
          board={board}
          onClose={closeCard}
          onChanged={load}
          onOpenCard={openCard}
        />
      )}

      {settingsOpen && (
        <BoardSettingsModal
          board={board}
          onClose={() => setSettingsOpen(false)}
          onChanged={load}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteList}
        title="Delete this list?"
        message="Every card in the list will be deleted as well. This cannot be undone."
        confirmLabel="Delete list"
        onCancel={() => setConfirmDeleteList(null)}
        onConfirm={() => confirmDeleteList && deleteList(confirmDeleteList)}
      />
    </div>
  );
}

/* -------------------------------------------------------------- filter menu */

function FilterMenu({
  board,
  filters,
  setFilters,
  count,
  compactLabels,
  setCompactLabels,
}: {
  board: BoardData;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  count: number;
  compactLabels: boolean;
  setCompactLabels: (v: boolean) => void;
}) {
  const toggle = (key: 'members' | 'labels' | 'priorities', value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  return (
    <Popover
      align="right"
      width="w-72"
      trigger={({ toggle: t }) => (
        <button className={cn('btn', count ? 'btn-solid' : 'btn-subtle')} onClick={t}>
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">Filter</span>
          {count > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">{count}</span>
          )}
        </button>
      )}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <p className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Users size={12} /> Members
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {board.members.map((m) => (
            <button
              key={m.userId}
              onClick={() => toggle('members', m.userId)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-1.5 py-1 text-xs transition-colors',
                filters.members.includes(m.userId)
                  ? 'border-primary bg-primary/14 text-primary'
                  : 'border-line text-muted hover:text-ink'
              )}
            >
              <Avatar user={m.user} size={18} />
              <span className="max-w-[6rem] truncate">{m.user.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        <p className="flex items-center gap-2 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Tag size={12} /> Labels
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {board.labels.map((l) => (
            <button
              key={l.id}
              onClick={() => toggle('labels', l.id)}
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium transition-all',
                filters.labels.includes(l.id) && 'ring-2 ring-ink ring-offset-1 ring-offset-surface'
              )}
              style={{ background: `${l.color}2e`, color: l.color }}
            >
              {l.name || 'Unnamed'}
            </button>
          ))}
        </div>

        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Priority
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5 px-2">
          {PRIORITIES.filter((p) => p.value !== 'NONE').map((p) => (
            <button
              key={p.value}
              onClick={() => toggle('priorities', p.value)}
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium transition-all',
                filters.priorities.includes(p.value) &&
                  'ring-2 ring-ink ring-offset-1 ring-offset-surface'
              )}
              style={{ background: `${p.color}22`, color: p.color }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Due date
        </p>
        <div className="mb-2 grid grid-cols-2 gap-1.5 px-2">
          {(
            [
              ['any', 'Any'],
              ['overdue', 'Overdue'],
              ['week', 'Next 7 days'],
              ['none', 'No date'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilters((f) => ({ ...f, due: value }))}
              className={cn(
                'rounded-sm border px-2 py-1 text-xs transition-colors',
                filters.due === value
                  ? 'border-primary bg-primary/14 text-primary'
                  : 'border-line text-muted hover:text-ink'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider my-1.5" />
        <MenuItem
          active={filters.hideComplete}
          onClick={() => setFilters((f) => ({ ...f, hideComplete: !f.hideComplete }))}
        >
          Hide completed cards
        </MenuItem>
        <MenuItem active={compactLabels} onClick={() => setCompactLabels(!compactLabels)}>
          Compact labels
        </MenuItem>
        {count > 0 && (
          <>
            <div className="divider my-1.5" />
            <MenuItem danger onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear all filters
            </MenuItem>
          </>
        )}
      </div>
    </Popover>
  );
}
