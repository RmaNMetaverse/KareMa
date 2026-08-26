import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Layers, Plus, SquareKanban, Star, Users } from 'lucide-react';
import { get, post } from '../lib/api';
import { useApp } from '../store/app';
import { cn, timeAgo } from '../lib/utils';
import { AvatarStack, EmptyState, Spinner } from '../components/ui';
import { BoardCreateModal } from '../components/BoardCreateModal';

type Board = {
  id: string;
  title: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  starred: boolean;
  myRole: string;
  updatedAt: string;
  members: { user: { id: string; name: string; avatarColor: string; avatarUrl?: string | null } }[];
  _count: { cards: number; lists: number };
};

export function Dashboard() {
  const { user, toast } = useApp();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const canCreate = !!user?.permissions?.['boards.create'];

  const load = async (archived = showArchived) => {
    setLoading(true);
    try {
      const res = await get<{ boards: Board[] }>(`/api/boards${archived ? '?archived=true' : ''}`);
      setBoards(res.boards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showArchived);
  }, [showArchived]);

  const toggleStar = async (board: Board, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await post<{ starred: boolean }>(`/api/boards/${board.id}/star`);
      setBoards((prev) =>
        prev.map((b) => (b.id === board.id ? { ...b, starred: res.starred } : b))
      );
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const starred = boards.filter((b) => b.starred);
  const rest = boards.filter((b) => !b.starred);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {greeting}, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {boards.length} {boards.length === 1 ? 'board' : 'boards'}
            {showArchived ? ' in the archive' : ' available to you'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={cn('btn', showArchived ? 'btn-solid' : 'btn-subtle')}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive size={15} />
            {showArchived ? 'Viewing archive' : 'Archive'}
          </button>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              New board
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="glass rounded-2xl">
          <EmptyState
            icon={<SquareKanban size={26} />}
            title={showArchived ? 'The archive is empty' : 'No boards yet'}
            description={
              showArchived
                ? 'Boards you archive will show up here.'
                : 'Create your first board to start tracking work.'
            }
            action={
              !showArchived && canCreate ? (
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} />
                  Create a board
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          {starred.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <Star size={13} className="fill-warning text-warning" />
                Starred
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {starred.map((b) => (
                  <BoardCard key={b.id} board={b} onToggleStar={toggleStar} />
                ))}
              </div>
            </section>
          )}

          <section>
            {starred.length > 0 && (
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                All boards
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((b) => (
                <BoardCard key={b.id} board={b} onToggleStar={toggleStar} />
              ))}
              {!showArchived && canCreate && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="group flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-surface3/60 transition-colors group-hover:bg-primary/14">
                    <Plus size={20} />
                  </span>
                  <span className="text-sm font-medium">New board</span>
                </button>
              )}
            </div>
          </section>
        </>
      )}

      <BoardCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(board) => {
          load();
          navigate(`/b/${board.id}`);
        }}
      />
    </div>
  );
}

function BoardCard({
  board,
  onToggleStar,
}: {
  board: Board;
  onToggleStar: (b: Board, e: React.MouseEvent) => void;
}) {
  return (
    <Link
      to={`/b/${board.id}`}
      className="glass glass-sheen glass-hover group relative flex min-h-[10rem] flex-col overflow-hidden rounded-xl"
    >
      <div
        className="relative h-20 shrink-0"
        style={{
          background: `linear-gradient(135deg, ${board.color}, ${board.color}55)`,
        }}
      >
        <span className="absolute bottom-3 left-4 grid h-10 w-10 place-items-center rounded-lg bg-white/25 text-xl backdrop-blur-sm">
          {board.icon || <SquareKanban size={18} className="text-white" />}
        </span>
        <button
          onClick={(e) => onToggleStar(board, e)}
          className={cn(
            'absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition-all hover:scale-110',
            !board.starred && 'opacity-0 group-hover:opacity-100'
          )}
          aria-label={board.starred ? 'Remove star' : 'Star board'}
        >
          <Star size={14} className={board.starred ? 'fill-warning text-warning' : ''} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="truncate text-[15px] font-semibold">{board.title}</h3>
        {board.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
            {board.description}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">Updated {timeAgo(board.updatedAt)}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Layers size={12} />
              {board._count.cards}
            </span>
            <span className="flex items-center gap-1">
              <Users size={12} />
              {board.members.length}
            </span>
          </div>
          <AvatarStack users={board.members.map((m) => m.user)} max={4} size={22} />
        </div>
      </div>
    </Link>
  );
}
