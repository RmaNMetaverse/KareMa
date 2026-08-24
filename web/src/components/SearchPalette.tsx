import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Search, SquareKanban } from 'lucide-react';
import { get } from '../lib/api';
import { cn } from '../lib/utils';
import { Avatar, Modal, Spinner } from './ui';

type Result = {
  cards: any[];
  boards: any[];
};

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Result>({ cards: [], boards: [] });
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setRes({ cards: [], boards: [] });
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes({ cards: [], boards: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await get<Result>(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (!cancelled) {
          setRes(data);
          setCursor(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const flat = useMemo(
    () => [
      ...res.boards.map((b) => ({ kind: 'board' as const, item: b })),
      ...res.cards.map((c) => ({ kind: 'card' as const, item: c })),
    ],
    [res]
  );

  const go = (entry: (typeof flat)[number]) => {
    if (entry.kind === 'board') navigate(`/b/${entry.item.id}`);
    else navigate(`/b/${entry.item.board.id}?card=${entry.item.id}`);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor]);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl" label="Search">
      <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search cards and boards..."
          className="w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
        {loading && <Spinner size={16} />}
        <kbd className="hidden rounded-xs border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">
          Esc
        </kbd>
      </div>

      <div className="max-h-[26rem] overflow-y-auto p-2">
        {q.trim().length < 2 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            Type at least two characters to search.
          </p>
        ) : flat.length === 0 && !loading ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            Nothing matched &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <>
            {res.boards.length > 0 && (
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Boards
              </p>
            )}
            {flat.map((entry, i) => (
              <button
                key={`${entry.kind}-${entry.item.id}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(entry)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors',
                  i === cursor ? 'bg-primary/14' : 'hover:bg-surface3/60'
                )}
              >
                {entry.kind === 'board' ? (
                  <>
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-sm"
                      style={{ background: `${entry.item.color}22`, color: entry.item.color }}
                    >
                      {entry.item.icon || <SquareKanban size={15} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {entry.item.title}
                    </span>
                    <span className="text-[11px] text-muted">Board</span>
                  </>
                ) : (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface3/70 text-muted">
                      <Layers size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.item.title}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {entry.item.board.title} · {entry.item.list.title}
                      </span>
                    </span>
                    <span className="flex -space-x-1.5">
                      {entry.item.assignees?.slice(0, 3).map((a: any) => (
                        <Avatar key={a.user.id} user={a.user} size={20} ring />
                      ))}
                    </span>
                  </>
                )}
              </button>
            ))}
            {res.cards.length > 0 && res.boards.length > 0 && <div className="h-1" />}
          </>
        )}
      </div>
    </Modal>
  );
}
