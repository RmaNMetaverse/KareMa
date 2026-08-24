import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  HardDrive,
  LayoutGrid,
  MessageSquare,
  Paperclip,
  SquareKanban,
  TrendingUp,
} from 'lucide-react';
import { get } from '../../lib/api';
import { cn, dueState, formatBytes, formatDate, timeAgo } from '../../lib/utils';
import { Avatar, Modal, ModalHeader, Spinner } from '../ui';

type Report = {
  user: any;
  days: number;
  totals: {
    assigned: number;
    open: number;
    completed: number;
    overdue: number;
    createdCards: number;
    comments: number;
    attachments: number;
    storageBytes: number;
    boards: number;
    completionRate: number;
    actionsInWindow: number;
    completedInWindow: number;
  };
  trend: { date: string; completed: number; created: number; comments: number }[];
  boards: any[];
  openCards: any[];
  doneCards: any[];
  activity: any[];
};

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'open', label: 'Open work' },
  { id: 'done', label: 'Completed' },
  { id: 'activity', label: 'Activity' },
] as const;

export function UserReviewPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('summary');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<{ report: Report }>(`/api/admin/users/${userId}/report?days=${days}`)
      .then((r) => {
        if (!cancelled) setReport(r.report);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  return (
    <Modal open onClose={onClose} width="max-w-4xl" label="User review">
      {loading && !report ? (
        <div className="flex h-72 items-center justify-center text-muted">
          <Spinner size={22} />
        </div>
      ) : !report ? (
        <div className="p-10 text-center text-sm text-muted">Could not load this report.</div>
      ) : (
        <>
          <ModalHeader
            title={
              <span className="flex items-center gap-2.5">
                <Avatar user={report.user} size={30} />
                {report.user.name}
              </span>
            }
            subtitle={
              <>
                {report.user.title ? `${report.user.title} · ` : ''}
                {report.user.email} · {report.user.role.toLowerCase()} ·{' '}
                {report.user.lastSeenAt
                  ? `last seen ${timeAgo(report.user.lastSeenAt)}`
                  : 'never signed in'}
              </>
            }
            onClose={onClose}
            right={
              <div className="mr-1 flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    onClick={() => setDays(r.days)}
                    className={cn(
                      'rounded-sm px-2 py-1 text-[11px] font-medium transition-colors',
                      days === r.days
                        ? 'bg-primary/16 text-primary'
                        : 'text-muted hover:bg-surface3/60 hover:text-ink'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            }
          />

          <div className="flex gap-1 border-b border-line/70 px-4 pt-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  section === s.id
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted hover:text-ink'
                )}
              >
                {s.label}
                {s.id === 'open' && report.totals.open > 0 && (
                  <span className="ml-1.5 text-[11px] text-muted">{report.totals.open}</span>
                )}
              </button>
            ))}
          </div>

          <div className="max-h-[64vh] overflow-y-auto p-5">
            {loading && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                <Spinner size={12} /> refreshing…
              </div>
            )}

            {section === 'summary' && <Summary report={report} />}
            {section === 'open' && (
              <CardList
                cards={report.openCards}
                empty="Nothing open is assigned to this person right now."
              />
            )}
            {section === 'done' && (
              <CardList
                cards={report.doneCards}
                empty="No completed cards are assigned to this person yet."
                done
              />
            )}
            {section === 'activity' && <ActivityTrail activity={report.activity} days={days} />}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- summary */

function Summary({ report }: { report: Report }) {
  const t = report.totals;

  const tiles = [
    {
      label: 'Assigned',
      value: t.assigned,
      hint: `${t.open} still open`,
      icon: <ClipboardList size={15} />,
      tone: 'text-primary',
    },
    {
      label: 'Completed',
      value: t.completed,
      hint: `${t.completionRate}% of assigned`,
      icon: <CheckCircle2 size={15} />,
      tone: 'text-success',
    },
    {
      label: 'Overdue',
      value: t.overdue,
      hint: t.overdue ? 'past the due date' : 'nothing late',
      icon: <AlertTriangle size={15} />,
      tone: t.overdue ? 'text-danger' : 'text-muted',
    },
    {
      label: `Finished in ${report.days}d`,
      value: t.completedInWindow,
      hint: `${t.actionsInWindow} actions total`,
      icon: <TrendingUp size={15} />,
      tone: 'text-primary',
    },
    {
      label: 'Cards created',
      value: t.createdCards,
      icon: <SquareKanban size={15} />,
      tone: 'text-muted',
    },
    { label: 'Comments', value: t.comments, icon: <MessageSquare size={15} />, tone: 'text-muted' },
    {
      label: 'Attachments',
      value: t.attachments,
      hint: formatBytes(t.storageBytes),
      icon: <Paperclip size={15} />,
      tone: 'text-muted',
    },
    { label: 'Boards', value: t.boards, icon: <LayoutGrid size={15} />, tone: 'text-muted' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="glass rounded-lg p-3">
            <div className={cn('flex items-center gap-1.5', tile.tone)}>
              {tile.icon}
              <span className="text-[11px] font-medium uppercase tracking-wide">{tile.label}</span>
            </div>
            <p className="mt-1.5 text-xl font-extrabold tracking-tight">{tile.value}</p>
            {tile.hint && <p className="text-[11px] text-muted">{tile.hint}</p>}
          </div>
        ))}
      </div>

      <TrendChart trend={report.trend} days={report.days} />

      <section>
        <h3 className="mb-2.5 text-sm font-semibold">Work per board</h3>
        {report.boards.length === 0 ? (
          <p className="text-sm text-muted">This person is not on any board yet.</p>
        ) : (
          <div className="space-y-1.5">
            {report.boards.map((b) => {
              const pct = b.assigned ? Math.round((b.completed / b.assigned) * 100) : 0;
              return (
                <div key={b.id} className="glass flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-xs"
                    style={{ background: `${b.color}26`, color: b.color }}
                  >
                    {b.icon || <SquareKanban size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link to={`/b/${b.id}`} className="truncate text-sm font-medium hover:underline">
                        {b.title}
                      </Link>
                      <span className="shrink-0 text-[11px] text-muted">
                        {b.completed}/{b.assigned} done · {b.role.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface3">
                      <div
                        className="h-full rounded-full bg-success transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ trend chart */

function TrendChart({ trend, days }: { trend: Report['trend']; days: number }) {
  const max = useMemo(
    () => Math.max(1, ...trend.map((d) => d.completed + d.created + d.comments)),
    [trend]
  );
  const total = trend.reduce((n, d) => n + d.completed + d.created + d.comments, 0);

  if (total === 0) {
    return (
      <section>
        <h3 className="mb-2.5 text-sm font-semibold">Daily activity</h3>
        <div className="glass rounded-lg p-6 text-center text-sm text-muted">
          No recorded activity in the last {days} days.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Daily activity</h3>
        <div className="flex gap-3 text-[11px] text-muted">
          <Legend color="hsl(var(--success))" label="completed" />
          <Legend color="hsl(var(--primary))" label="cards created" />
          <Legend color="hsl(var(--secondary))" label="comments" />
        </div>
      </div>

      <div className="glass rounded-lg p-4">
        <div className="flex h-32 items-end gap-[2px]">
          {trend.map((d) => {
            const sum = d.completed + d.created + d.comments;
            const h = (sum / max) * 100;
            return (
              <div
                key={d.date}
                className="group/bar relative flex flex-1 flex-col justify-end"
                style={{ height: '100%' }}
                title={`${formatDate(d.date)} — ${d.completed} completed, ${d.created} created, ${d.comments} comments`}
              >
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-t-[2px] transition-opacity group-hover/bar:opacity-80"
                  style={{ height: `${h}%`, minHeight: sum ? 3 : 0 }}
                >
                  {d.completed > 0 && (
                    <span
                      className="w-full"
                      style={{ flex: d.completed, background: 'hsl(var(--success))' }}
                    />
                  )}
                  {d.created > 0 && (
                    <span
                      className="w-full"
                      style={{ flex: d.created, background: 'hsl(var(--primary))' }}
                    />
                  )}
                  {d.comments > 0 && (
                    <span
                      className="w-full"
                      style={{ flex: d.comments, background: 'hsl(var(--secondary))' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{formatDate(trend[0]?.date)}</span>
          <span>{formatDate(trend[trend.length - 1]?.date)}</span>
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------- card lists */

function CardList({ cards, empty, done }: { cards: any[]; empty: string; done?: boolean }) {
  if (!cards.length) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;

  return (
    <div className="space-y-1.5">
      {cards.map((card) => {
        const state = dueState(card.dueDate, card.isComplete);
        return (
          <Link
            key={card.id}
            to={`/b/${card.board.id}?card=${card.id}`}
            className="glass glass-hover flex items-center gap-3 rounded-lg px-3 py-2.5"
          >
            {done ? (
              <CheckCircle2 size={16} className="shrink-0 text-success" />
            ) : (
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  state === 'overdue' ? 'bg-danger' : 'bg-muted'
                )}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-medium', done && 'text-muted line-through')}>
                {card.title}
              </p>
              <p className="truncate text-[11px] text-muted">
                <span style={{ color: card.board.color }}>{card.board.icon || '📋'}</span>{' '}
                {card.board.title} · {card.list.title}
              </p>
            </div>
            {card.labels?.slice(0, 2).map(({ label }: any) => (
              <span
                key={label.id}
                className="chip hidden sm:inline-flex"
                style={{ background: `${label.color}2e`, color: label.color }}
              >
                {label.name || 'Label'}
              </span>
            ))}
            {card.dueDate && (
              <span
                className={cn(
                  'chip shrink-0',
                  state === 'overdue' ? 'bg-danger/16 text-danger' : 'bg-surface3/60 text-muted'
                )}
              >
                {formatDate(card.dueDate)}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- activity list */

const ACTIVITY_TEXT: Record<string, (d: any) => string> = {
  'card.created': () => 'created a card',
  'card.moved': (d) => `moved a card from ${d.from} to ${d.to}`,
  'card.completed': () => 'completed a card',
  'card.reopened': () => 'reopened a card',
  'card.archived': () => 'archived a card',
  'card.assigned': (d) => `assigned ${d.name}`,
  'card.deleted': () => 'deleted a card',
  'comment.added': () => 'commented',
  'attachment.added': (d) => `attached ${d.filename}`,
  'list.created': (d) => `added the list "${d.title}"`,
  'list.deleted': (d) => `deleted the list "${d.title}"`,
  'board.created': (d) => `created the board "${d.title}"`,
  'member.added': (d) => `added ${d.name} to the board`,
};

function ActivityTrail({ activity, days }: { activity: any[]; days: number }) {
  if (!activity.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No recorded activity in the last {days} days.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-line/70 pl-4">
      {activity.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary/70" />
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
            <span>{ACTIVITY_TEXT[a.type]?.(a.data || {}) ?? a.type}</span>
            {a.card && (
              <Link
                to={`/b/${a.board.id}?card=${a.card.id}`}
                className="font-medium text-primary hover:underline"
              >
                {a.card.title}
              </Link>
            )}
            {a.board && (
              <span className="text-[11px] text-muted">
                in <span style={{ color: a.board.color }}>{a.board.icon || '📋'}</span>{' '}
                {a.board.title}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted">{timeAgo(a.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
