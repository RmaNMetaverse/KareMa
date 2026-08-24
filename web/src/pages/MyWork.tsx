import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ListChecks } from 'lucide-react';
import { get } from '../lib/api';
import { cn, dueState, formatDate, PRIORITIES } from '../lib/utils';
import { EmptyState, Spinner } from '../components/ui';

const GROUPS = [
  { id: 'overdue', label: 'Overdue', tone: 'text-danger' },
  { id: 'today', label: 'Due today', tone: 'text-warning' },
  { id: 'soon', label: 'Next few days', tone: 'text-warning' },
  { id: 'upcoming', label: 'Later', tone: 'text-muted' },
  { id: 'none', label: 'No due date', tone: 'text-muted' },
  { id: 'done', label: 'Completed', tone: 'text-success' },
] as const;

export function MyWork() {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ cards: any[] }>('/api/cards/mine')
      .then((r) => setCards(r.cards))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const card of cards) {
      const state = dueState(card.dueDate, card.isComplete);
      (map[state] ||= []).push(card);
    }
    return map;
  }, [cards]);

  const open = cards.filter((c) => !c.isComplete).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">My work</h1>
        <p className="mt-1 text-sm text-muted">
          {open} open {open === 1 ? 'card' : 'cards'} assigned to you across every board.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="glass rounded-2xl">
          <EmptyState
            icon={<ListChecks size={26} />}
            title="Nothing assigned to you"
            description="Cards you are assigned to will collect here, sorted by when they are due."
          />
        </div>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((group) => {
            const items = grouped[group.id];
            if (!items?.length) return null;
            return (
              <section key={group.id}>
                <h2
                  className={cn(
                    'mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
                    group.tone
                  )}
                >
                  <CalendarClock size={13} />
                  {group.label}
                  <span className="text-muted">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map((card) => (
                    <MyCardRow key={card.id} card={card} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyCardRow({ card }: { card: any }) {
  const priority = PRIORITIES.find((p) => p.value === card.priority);
  const due = dueState(card.dueDate, card.isComplete);

  return (
    <Link
      to={`/b/${card.board.id}?card=${card.id}`}
      className="glass glass-hover flex items-center gap-3 rounded-lg px-3.5 py-3"
    >
      {card.isComplete ? (
        <CheckCircle2 size={17} className="shrink-0 text-success" />
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: priority?.value === 'NONE' ? 'hsl(var(--muted))' : priority?.color }}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', card.isComplete && 'text-muted line-through')}>
          {card.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
          <span style={{ color: card.board.color }}>{card.board.icon || '📋'}</span>
          {card.board.title}
          <span>·</span>
          {card.list.title}
        </p>
      </div>

      {card.labels?.length > 0 && (
        <div className="hidden gap-1 sm:flex">
          {card.labels.slice(0, 3).map(({ label }: any) => (
            <span
              key={label.id}
              className="chip"
              style={{ background: `${label.color}2e`, color: label.color }}
            >
              {label.name || 'Label'}
            </span>
          ))}
        </div>
      )}

      {card.dueDate && (
        <span
          className={cn(
            'chip shrink-0',
            due === 'overdue'
              ? 'bg-danger/16 text-danger'
              : due === 'today' || due === 'soon'
                ? 'bg-warning/16 text-warning'
                : 'bg-surface3/60 text-muted'
          )}
        >
          {formatDate(card.dueDate)}
        </span>
      )}
    </Link>
  );
}
