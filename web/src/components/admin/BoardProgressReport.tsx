import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  ListChecks,
  PieChart,
  RefreshCw,
  SquareKanban,
  Tag,
  TriangleAlert,
  X,
} from 'lucide-react';
import { downloadApiFile, get } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useApp } from '../../store/app';
import { Popover, Spinner } from '../ui';

type WorkCount = { total: number; completed: number };

type ProgressMetrics = {
  progress: number;
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  cards: WorkCount;
  subtasks: WorkCount;
  checklistItems: WorkCount;
};

type ReportTag = { id: string; name: string; color: string };

type ListProgress = ProgressMetrics & {
  id: string;
  title: string;
  color?: string | null;
  tags: ReportTag[];
};

type BoardProgress = ProgressMetrics & {
  id: string;
  title: string;
  color: string;
  icon?: string | null;
  tags: ReportTag[];
  lists: ListProgress[];
};

type ProgressReport = {
  generatedAt: string;
  totals: {
    totalUnits: number;
    completedUnits: number;
    remainingUnits: number;
    progress: number;
    boards: number;
    completeBoards: number;
    emptyBoards: number;
  };
  tags: ReportTag[];
  boards: BoardProgress[];
};

type ReportSort = 'progress-desc' | 'progress-asc' | 'remaining-desc' | 'name-asc' | 'tag-asc';

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--danger))',
  'hsl(var(--warning))',
  'hsl(var(--success))',
  '#0ea5e9',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
];

export function BoardProgressReport() {
  const { toast } = useApp();
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any');
  const [sort, setSort] = useState<ReportSort>('progress-desc');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await get<{ report: ProgressReport }>('/api/admin/board-progress');
      setReport(res.report);
    } catch (err: any) {
      setError(err.message || 'Could not load board progress');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportReport = async (format: 'csv' | 'xlsx', board?: BoardProgress) => {
    const key = `${board?.id || 'all'}:${format}`;
    setExporting(key);
    try {
      const boardQuery = board ? `&boardId=${encodeURIComponent(board.id)}` : '';
      const tagQuery = selectedTags.length
        ? `&tagIds=${encodeURIComponent(selectedTags.join(','))}&tagMode=${tagMode}`
        : '';
      await downloadApiFile(
        `/api/admin/board-progress/export?format=${format}${boardQuery}${tagQuery}&sort=${sort}`
      );
      toast({
        title: board ? `${board.title} report exported` : 'Board progress report exported',
        description: format === 'xlsx' ? 'Excel workbook downloaded' : 'CSV file downloaded',
        tone: 'success',
      });
    } catch (err: any) {
      toast({ title: err.message || 'Export failed', tone: 'error' });
    } finally {
      setExporting('');
    }
  };

  if (loading && !report) return <ReportSkeleton />;

  if (error && !report) {
    return (
      <div className="glass rounded-xl px-5 py-12 text-center">
        <TriangleAlert className="mx-auto text-danger" size={26} />
        <h2 className="mt-3 text-sm font-semibold">Could not load the progress report</h2>
        <p className="mt-1 text-xs text-muted">{error}</p>
        <button className="btn btn-subtle mt-4" onClick={load}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  if (!report) return null;

  const boards = filterAndSortBoards(report.boards, selectedTags, tagMode, sort);
  const totals = calculateTotals(boards);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Board progress</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            Progress combines active cards—including subtasks—with every checklist item. Each one
            counts as a work unit, so the charts reflect both completion and the amount of work on
            each board.
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Updated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-subtle"
            onClick={() => exportReport('csv')}
            disabled={!!exporting}
          >
            {exporting === 'all:csv' ? <Spinner size={14} /> : <FileText size={14} />}
            Export CSV
          </button>
          <button
            className="btn btn-subtle"
            onClick={() => exportReport('xlsx')}
            disabled={!!exporting}
          >
            {exporting === 'all:xlsx' ? <Spinner size={14} /> : <FileSpreadsheet size={14} />}
            Export Excel
          </button>
          <button className="btn btn-subtle" onClick={load} disabled={loading || !!exporting}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      <ReportControls
        tags={report.tags}
        selectedTags={selectedTags}
        onSelectedTags={setSelectedTags}
        tagMode={tagMode}
        onTagMode={setTagMode}
        sort={sort}
        onSort={setSort}
        resultCount={boards.length}
        totalCount={report.boards.length}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Overall progress"
          value={`${totals.progress}%`}
          hint={`${formatCount(totals.completedUnits)} of ${formatCount(totals.totalUnits)} work units`}
          icon={<ClipboardCheck size={18} />}
          tone="primary"
        />
        <SummaryCard
          label="Work completed"
          value={formatCount(totals.completedUnits)}
          hint="cards and checklist items"
          icon={<CheckCircle2 size={18} />}
          tone="success"
        />
        <SummaryCard
          label="Work remaining"
          value={formatCount(totals.remainingUnits)}
          hint="across the boards shown"
          icon={<ListChecks size={18} />}
          tone="warning"
        />
        <SummaryCard
          label="Boards complete"
          value={`${totals.completeBoards} / ${totals.boards}`}
          hint={
            totals.emptyBoards
              ? `${totals.emptyBoards} empty ${totals.emptyBoards === 1 ? 'board' : 'boards'} excluded`
              : 'boards with tracked work'
          }
          icon={<SquareKanban size={18} />}
          tone="secondary"
        />
      </div>

      {boards.length === 0 ? (
        <div className="glass rounded-xl px-5 py-14 text-center">
          <SquareKanban className="mx-auto text-muted" size={28} />
          <h3 className="mt-3 text-sm font-semibold">
            {selectedTags.length ? 'No boards match these tags' : 'No active boards yet'}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {selectedTags.length
              ? 'Try removing a tag or switching from match all to match any.'
              : 'Board progress will appear here once work begins.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
            <ProgressBarChart boards={boards} />
            <RemainingPieChart boards={boards} totalRemaining={totals.remainingUnits} />
          </div>
          <BoardBreakdown boards={boards} />
          <ListProgressByBoard boards={boards} exporting={exporting} onExport={exportReport} />
        </>
      )}
    </div>
  );
}

function ReportControls({
  tags,
  selectedTags,
  onSelectedTags,
  tagMode,
  onTagMode,
  sort,
  onSort,
  resultCount,
  totalCount,
}: {
  tags: ReportTag[];
  selectedTags: string[];
  onSelectedTags: (ids: string[]) => void;
  tagMode: 'any' | 'all';
  onTagMode: (mode: 'any' | 'all') => void;
  sort: ReportSort;
  onSort: (sort: ReportSort) => void;
  resultCount: number;
  totalCount: number;
}) {
  const selected = new Set(selectedTags);
  const toggle = (id: string) =>
    onSelectedTags(selected.has(id) ? selectedTags.filter((item) => item !== id) : [...selectedTags, id]);

  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-xl p-3">
      <Popover
        width="w-72"
        trigger={({ toggle: open }) => (
          <button className={cn('btn', selectedTags.length ? 'btn-solid' : 'btn-subtle')} onClick={open}>
            <Tag size={14} />
            Tags
            {selectedTags.length > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">
                {selectedTags.length}
              </span>
            )}
          </button>
        )}
      >
        <div className="flex items-center justify-between gap-2 px-1.5 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Filter by tags
          </p>
          {selectedTags.length > 0 && (
            <button className="text-[11px] font-medium text-primary" onClick={() => onSelectedTags([])}>
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {tags.map((tag) => (
            <button
              key={tag.id}
              className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 hover:bg-surface3/60"
              onClick={() => toggle(tag.id)}
            >
              <span
                className="h-6 min-w-0 flex-1 truncate rounded-sm px-2 text-left text-xs font-semibold leading-6"
                style={{ background: `${tag.color}2e`, color: tag.color }}
              >
                {tag.name || 'Unnamed'}
              </span>
              {selected.has(tag.id) && <Check size={14} className="shrink-0 text-primary" />}
            </button>
          ))}
          {tags.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted">No tags in use yet.</p>}
        </div>
      </Popover>

      {selectedTags.length > 1 && (
        <div className="flex rounded-md bg-surface2/70 p-0.5 text-xs">
          {(['any', 'all'] as const).map((mode) => (
            <button
              key={mode}
              className={cn(
                'rounded-sm px-2.5 py-1.5 font-medium capitalize transition-colors',
                tagMode === mode ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              )}
              onClick={() => onTagMode(mode)}
            >
              Match {mode}
            </button>
          ))}
        </div>
      )}

      <label className="ml-auto flex items-center gap-2 text-xs text-muted">
        <ArrowUpDown size={13} />
        <span className="hidden sm:inline">Sort</span>
        <select className="input w-auto py-1.5 text-xs text-ink" value={sort} onChange={(event) => onSort(event.target.value as ReportSort)}>
          <option value="progress-desc">Progress: high to low</option>
          <option value="progress-asc">Progress: low to high</option>
          <option value="remaining-desc">Remaining work</option>
          <option value="name-asc">Board name</option>
          <option value="tag-asc">Tag name</option>
        </select>
      </label>

      <span className="w-full text-[11px] text-muted sm:w-auto">
        Showing {resultCount} of {totalCount} {totalCount === 1 ? 'board' : 'boards'}
      </span>

      {selectedTags.length > 0 && (
        <div className="order-last flex w-full flex-wrap gap-1 border-t border-line/50 pt-2">
          {selectedTags.map((id) => {
            const tag = tags.find((item) => item.id === id);
            if (!tag) return null;
            return (
              <button
                key={tag.id}
                className="chip"
                style={{ background: `${tag.color}2e`, color: tag.color }}
                onClick={() => toggle(tag.id)}
              >
                {tag.name || 'Unnamed'} <X size={11} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function filterAndSortBoards(
  boards: BoardProgress[],
  selectedTags: string[],
  tagMode: 'any' | 'all',
  sort: ReportSort
) {
  const filtered = boards.filter((board) => {
    if (!selectedTags.length) return true;
    const ids = new Set(board.tags.map((tag) => tag.id));
    return tagMode === 'all'
      ? selectedTags.every((id) => ids.has(id))
      : selectedTags.some((id) => ids.has(id));
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'progress-asc') return a.progress - b.progress || a.title.localeCompare(b.title);
    if (sort === 'remaining-desc') return b.remainingUnits - a.remainingUnits || a.title.localeCompare(b.title);
    if (sort === 'name-asc') return a.title.localeCompare(b.title);
    if (sort === 'tag-asc') {
      const aTag = a.tags[0]?.name;
      const bTag = b.tags[0]?.name;
      if (!aTag && bTag) return 1;
      if (aTag && !bTag) return -1;
      return (aTag ?? '').localeCompare(bTag ?? '') || a.title.localeCompare(b.title);
    }
    return b.progress - a.progress || b.totalUnits - a.totalUnits || a.title.localeCompare(b.title);
  });
}

function calculateTotals(boards: BoardProgress[]) {
  const sums = boards.reduce(
    (total, board) => ({
      totalUnits: total.totalUnits + board.totalUnits,
      completedUnits: total.completedUnits + board.completedUnits,
      remainingUnits: total.remainingUnits + board.remainingUnits,
    }),
    { totalUnits: 0, completedUnits: 0, remainingUnits: 0 }
  );
  return {
    ...sums,
    progress: sums.totalUnits ? Math.round((sums.completedUnits / sums.totalUnits) * 100) : 0,
    boards: boards.length,
    completeBoards: boards.filter((board) => board.totalUnits > 0 && board.remainingUnits === 0).length,
    emptyBoards: boards.filter((board) => board.totalUnits === 0).length,
  };
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: 'primary' | 'success' | 'warning' | 'secondary';
}) {
  const tones = {
    primary: 'bg-primary/14 text-primary',
    success: 'bg-success/14 text-success',
    warning: 'bg-warning/14 text-warning',
    secondary: 'bg-secondary/14 text-secondary',
  };

  return (
    <div className="glass glass-sheen rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <span className={cn('grid h-8 w-8 place-items-center rounded-md', tones[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function ProgressBarChart({ boards }: { boards: BoardProgress[] }) {
  const chartWidth = Math.max(720, boards.length * 80 + 64);

  return (
    <section className="glass overflow-hidden rounded-xl">
      <div className="border-b border-line/60 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/14 text-primary">
            <ClipboardCheck size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Progress by board</h3>
            <p className="text-[11px] text-muted">Board completion in the selected report order</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-4 pt-5">
        <div style={{ width: chartWidth }}>
          <div className="relative ml-10 h-56 border-b border-l border-line/70">
            {[0, 25, 50, 75, 100].map((tick) => (
              <div
                key={tick}
                className="pointer-events-none absolute inset-x-0 border-t border-line/40"
                style={{ bottom: `${tick}%` }}
              >
                <span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] tabular-nums text-muted">
                  {tick}%
                </span>
              </div>
            ))}

            <div className="absolute inset-0 flex items-end gap-4 px-4">
              {boards.map((board) => (
                <div key={board.id} className="group/bar relative h-full w-16 shrink-0">
                  <span
                    className="absolute inset-x-0 z-10 text-center text-[11px] font-semibold tabular-nums"
                    style={{ bottom: `calc(${board.progress}% + 5px)` }}
                  >
                    {board.progress}%
                  </span>
                  <div
                    className="absolute inset-x-2 bottom-0 rounded-t-md shadow-sm transition-[filter] group-hover/bar:brightness-110"
                    style={{
                      height: `${board.progress}%`,
                      minHeight: board.progress ? 4 : 0,
                      background: `linear-gradient(180deg, ${board.color}, ${board.color}bb)`,
                    }}
                    title={`${board.title}: ${board.progress}% complete (${board.completedUnits}/${board.totalUnits} work units)`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="ml-10 flex gap-4 px-4 pt-3">
            {boards.map((board) => (
              <Link
                key={board.id}
                to={`/b/${board.id}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1 text-center hover:text-primary"
                title={board.title}
              >
                <span className="text-sm leading-none">{board.icon || '📋'}</span>
                <span className="line-clamp-2 text-[10px] font-medium leading-tight">{board.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RemainingPieChart({
  boards,
  totalRemaining,
}: {
  boards: BoardProgress[];
  totalRemaining: number;
}) {
  const remaining = useMemo(
    () =>
      boards
        .filter((board) => board.remainingUnits > 0)
        .sort((a, b) => b.remainingUnits - a.remainingUnits),
    [boards]
  );

  let offset = 0;
  const slices = remaining.map((board, index) => {
    const share = totalRemaining ? (board.remainingUnits / totalRemaining) * 100 : 0;
    const slice = { board, share, offset, color: PIE_COLORS[index % PIE_COLORS.length] };
    offset += share;
    return slice;
  });

  return (
    <section className="glass overflow-hidden rounded-xl">
      <div className="border-b border-line/60 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-warning/14 text-warning">
            <PieChart size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Share of unfinished work</h3>
            <p className="text-[11px] text-muted">Which boards own the remaining workload</p>
          </div>
        </div>
      </div>

      {totalRemaining === 0 ? (
        <div className="grid min-h-[340px] place-items-center px-5 text-center">
          <div>
            <CheckCircle2 className="mx-auto text-success" size={36} />
            <h4 className="mt-3 text-sm font-semibold">Everything is complete</h4>
            <p className="mt-1 text-xs text-muted">There is no unfinished work to divide.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[190px_minmax(0,1fr)]">
          <div className="relative mx-auto h-[190px] w-[190px]">
            <svg
              viewBox="0 0 220 220"
              className="h-full w-full -rotate-0"
              role="img"
              aria-label={`${formatCount(totalRemaining)} unfinished work units split across ${remaining.length} boards`}
            >
              <circle
                cx="110"
                cy="110"
                r="76"
                fill="none"
                stroke="hsl(var(--surface-3))"
                strokeWidth="34"
              />
              {slices.map(({ board, share, offset: sliceOffset, color }) => (
                <circle
                  key={board.id}
                  cx="110"
                  cy="110"
                  r="76"
                  pathLength="100"
                  fill="none"
                  stroke={color}
                  strokeWidth="34"
                  strokeDasharray={`${Math.max(share - 0.45, 0)} ${100 - Math.max(share - 0.45, 0)}`}
                  strokeDashoffset={-sliceOffset}
                  transform="rotate(-90 110 110)"
                >
                  <title>{`${board.title}: ${board.remainingUnits} remaining (${Math.round(share)}%)`}</title>
                </circle>
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-2xl font-extrabold tracking-tight">
                  {formatCount(totalRemaining)}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted">unfinished</p>
              </div>
            </div>
          </div>

          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
            {slices.map(({ board, share, color }) => (
              <Link
                key={board.id}
                to={`/b/${board.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface2/60"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{board.title}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {board.remainingUnits} · {Math.round(share)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BoardBreakdown({ boards }: { boards: BoardProgress[] }) {
  return (
    <section className="glass overflow-hidden rounded-xl">
      <div className="border-b border-line/60 px-4 py-3.5">
        <h3 className="text-sm font-semibold">Board breakdown</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          Subtasks are included in the card count and shown separately for context.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line/70 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Board</th>
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Progress</th>
              <th className="px-4 py-3 font-semibold">Cards</th>
              <th className="px-4 py-3 font-semibold">Subtasks</th>
              <th className="px-4 py-3 font-semibold">Checklist items</th>
              <th className="px-4 py-3 text-right font-semibold">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id} className="border-b border-line/40 last:border-0 hover:bg-surface2/50">
                <td className="px-4 py-3">
                  <Link to={`/b/${board.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-xs"
                      style={{ background: `${board.color}26`, color: board.color }}
                    >
                      {board.icon || '📋'}
                    </span>
                    <span className="max-w-48 truncate">{board.title}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <ReportTagChips tags={board.tags} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-32 items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${board.progress}%`, background: board.color }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs font-semibold tabular-nums">
                      {board.progress}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {board.cards.completed}/{board.cards.total}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {board.subtasks.completed}/{board.subtasks.total}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {board.checklistItems.completed}/{board.checklistItems.total}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {board.remainingUnits}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ListProgressByBoard({
  boards,
  exporting,
  onExport,
}: {
  boards: BoardProgress[];
  exporting: string;
  onExport: (format: 'csv' | 'xlsx', board: BoardProgress) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">List progress by board</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          Open a board to compare the completed and remaining work in each of its active lists.
        </p>
      </div>

      <div className="space-y-3">
        {boards.map((board, boardIndex) => (
          <details
            key={board.id}
            className="group glass overflow-hidden rounded-xl"
            open={boardIndex === 0}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface2/45 [&::-webkit-details-marker]:hidden">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm"
                style={{ background: `${board.color}26`, color: board.color }}
              >
                {board.icon || '📋'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-semibold">{board.title}</span>
                  <span className="text-[11px] text-muted">
                    {board.lists.length} {board.lists.length === 1 ? 'list' : 'lists'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 max-w-56 flex-1 overflow-hidden rounded-full bg-surface3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${board.progress}%`, background: board.color }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted">
                    {board.completedUnits}/{board.totalUnits} units
                  </span>
                </div>
                {board.tags.length > 0 && <ReportTagChips tags={board.tags} limit={4} />}
              </div>
              <span
                className="chip shrink-0 font-semibold tabular-nums"
                style={{ background: `${board.color}20`, color: board.color }}
              >
                {board.progress}%
              </span>
              <ChevronDown
                size={16}
                className="shrink-0 text-muted transition-transform group-open:rotate-180"
              />
            </summary>

            <div className="border-t border-line/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted">Export this board and its list details</p>
                <div className="flex gap-2">
                  <button
                    className="btn btn-subtle py-1.5 text-xs"
                    onClick={() => onExport('csv', board)}
                    disabled={!!exporting}
                  >
                    {exporting === `${board.id}:csv` ? (
                      <Spinner size={13} />
                    ) : (
                      <FileText size={13} />
                    )}
                    CSV
                  </button>
                  <button
                    className="btn btn-subtle py-1.5 text-xs"
                    onClick={() => onExport('xlsx', board)}
                    disabled={!!exporting}
                  >
                    {exporting === `${board.id}:xlsx` ? (
                      <Spinner size={13} />
                    ) : (
                      <FileSpreadsheet size={13} />
                    )}
                    Excel
                  </button>
                </div>
              </div>
              {board.lists.length === 0 ? (
                <div className="rounded-lg bg-surface2/45 px-4 py-8 text-center">
                  <ListChecks className="mx-auto text-muted" size={22} />
                  <p className="mt-2 text-sm font-medium">No active lists</p>
                  <p className="mt-0.5 text-xs text-muted">
                    This board has no list progress to report yet.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {board.lists.map((list) => (
                    <ListProgressCard key={list.id} list={list} boardColor={board.color} />
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ListProgressCard({
  list,
  boardColor,
}: {
  list: ListProgress;
  boardColor: string;
}) {
  const color = list.color || boardColor;
  const isComplete = list.totalUnits > 0 && list.remainingUnits === 0;

  return (
    <article className="rounded-lg border border-line/60 bg-surface2/45 p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="truncate text-sm font-semibold" title={list.title}>
              {list.title}
            </h4>
            <span
              className={cn(
                'shrink-0 text-xs font-bold tabular-nums',
                isComplete ? 'text-success' : list.totalUnits ? 'text-ink' : 'text-muted'
              )}
            >
              {list.totalUnits ? `${list.progress}%` : 'No work'}
            </span>
          </div>

          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-danger/14">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${list.progress}%`, background: color }}
            />
          </div>

          {list.tags.length > 0 && (
            <div className="mt-2">
              <ReportTagChips tags={list.tags} limit={5} />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="font-medium text-success">
              {formatCount(list.completedUnits)} done
            </span>
            <span className="font-medium text-danger">
              {formatCount(list.remainingUnits)} remaining
            </span>
            <span className="text-muted">{formatCount(list.totalUnits)} total units</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line/50 pt-3 text-center">
        <ListMetric label="Cards" count={list.cards} />
        <ListMetric label="Subtasks" count={list.subtasks} />
        <ListMetric label="Checklist" count={list.checklistItems} />
      </div>
    </article>
  );
}

function ReportTagChips({ tags, limit = 3 }: { tags: ReportTag[]; limit?: number }) {
  const visible = tags.slice(0, limit);
  return (
    <div className="mt-1 flex max-w-64 flex-wrap gap-1">
      {visible.map((tag) => (
        <span
          key={tag.id}
          className="max-w-28 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: `${tag.color}2e`, color: tag.color }}
          title={tag.name || 'Unnamed'}
        >
          {tag.name || 'Unnamed'}
        </span>
      ))}
      {tags.length > limit && (
        <span className="rounded-full bg-surface3 px-1.5 py-0.5 text-[10px] text-muted">
          +{tags.length - limit}
        </span>
      )}
    </div>
  );
}

function ListMetric({ label, count }: { label: string; count: WorkCount }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums">
        {count.completed}/{count.total}
      </p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-16 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="skeleton h-[370px]" />
        <div className="skeleton h-[370px]" />
      </div>
    </div>
  );
}

function formatCount(value: number) {
  return value.toLocaleString();
}
