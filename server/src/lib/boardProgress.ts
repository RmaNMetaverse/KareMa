import { prisma } from './prisma';

export type WorkCount = { total: number; completed: number };

export type ProgressMetrics = {
  progress: number;
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  cards: WorkCount;
  subtasks: WorkCount;
  checklistItems: WorkCount;
};

export type ReportTag = {
  id: string;
  name: string;
  color: string;
};

export type ListProgress = ProgressMetrics & {
  id: string;
  title: string;
  color: string | null;
  tags: ReportTag[];
};

export type BoardProgress = ProgressMetrics & {
  id: string;
  title: string;
  color: string;
  icon: string | null;
  tags: ReportTag[];
  lists: ListProgress[];
};

export type BoardProgressReport = {
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

type ProgressCard = {
  isComplete: boolean;
  parentId: string | null;
  labels: { label: ReportTag }[];
  checklists: {
    items: { isDone: boolean; tags: { label: ReportTag }[] }[];
  }[];
};

export type ReportFilterOptions = {
  tagIds?: string[];
  tagMode?: 'any' | 'all';
  sort?: 'progress-desc' | 'progress-asc' | 'remaining-desc' | 'name-asc' | 'tag-asc';
};

function summariseProgress(cards: ProgressCard[]): ProgressMetrics {
  const cardCompleted = cards.filter((card) => card.isComplete).length;
  const subtasks = cards.filter((card) => card.parentId !== null);
  const checklistItems = cards.flatMap((card) =>
    card.checklists.flatMap((checklist) => checklist.items)
  );
  const checklistCompleted = checklistItems.filter((item) => item.isDone).length;
  const totalUnits = cards.length + checklistItems.length;
  const completedUnits = cardCompleted + checklistCompleted;

  return {
    progress: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0,
    totalUnits,
    completedUnits,
    remainingUnits: totalUnits - completedUnits,
    cards: { total: cards.length, completed: cardCompleted },
    subtasks: {
      total: subtasks.length,
      completed: subtasks.filter((card) => card.isComplete).length,
    },
    checklistItems: {
      total: checklistItems.length,
      completed: checklistCompleted,
    },
  };
}

function collectTags(cards: ProgressCard[]): ReportTag[] {
  const tags = new Map<string, ReportTag>();
  for (const card of cards) {
    for (const relation of card.labels) tags.set(relation.label.id, relation.label);
    for (const checklist of card.checklists) {
      for (const item of checklist.items) {
        for (const relation of item.tags) tags.set(relation.label.id, relation.label);
      }
    }
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function reportTotals(boards: BoardProgress[]) {
  const totals = boards.reduce(
    (sum, board) => ({
      totalUnits: sum.totalUnits + board.totalUnits,
      completedUnits: sum.completedUnits + board.completedUnits,
      remainingUnits: sum.remainingUnits + board.remainingUnits,
    }),
    { totalUnits: 0, completedUnits: 0, remainingUnits: 0 }
  );
  return {
    ...totals,
    progress: totals.totalUnits
      ? Math.round((totals.completedUnits / totals.totalUnits) * 100)
      : 0,
    boards: boards.length,
    completeBoards: boards.filter(
      (board) => board.totalUnits > 0 && board.remainingUnits === 0
    ).length,
    emptyBoards: boards.filter((board) => board.totalUnits === 0).length,
  };
}

export function filterBoardProgressReport(
  report: BoardProgressReport,
  options: ReportFilterOptions = {}
): BoardProgressReport {
  const selected = [...new Set(options.tagIds ?? [])];
  let boards = report.boards.filter((board) => {
    if (!selected.length) return true;
    const ids = new Set(board.tags.map((tag) => tag.id));
    return options.tagMode === 'all'
      ? selected.every((id) => ids.has(id))
      : selected.some((id) => ids.has(id));
  });

  const sort = options.sort ?? 'progress-desc';
  boards = [...boards].sort((a, b) => {
    if (sort === 'progress-asc') return a.progress - b.progress || a.title.localeCompare(b.title);
    if (sort === 'remaining-desc') {
      return b.remainingUnits - a.remainingUnits || a.title.localeCompare(b.title);
    }
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

  return { ...report, totals: reportTotals(boards), boards };
}

/** Build the shared data source used by the admin UI and file exports. */
export async function getBoardProgressReport(): Promise<BoardProgressReport> {
  const boards = await prisma.board.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      color: true,
      icon: true,
      lists: {
        where: { isArchived: false },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          color: true,
          cards: {
            where: { isArchived: false },
            select: {
              isComplete: true,
              parentId: true,
              labels: { select: { label: { select: { id: true, name: true, color: true } } } },
              checklists: {
                select: {
                  items: {
                    select: {
                      isDone: true,
                      tags: {
                        select: { label: { select: { id: true, name: true, color: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const progressBoards: BoardProgress[] = boards.map((board) => {
    const lists = board.lists.map((list) => ({
      id: list.id,
      title: list.title,
      color: list.color,
      tags: collectTags(list.cards),
      ...summariseProgress(list.cards),
    }));
    const cards = board.lists.flatMap((list) => list.cards);
    const summary = summariseProgress(cards);

    return {
      id: board.id,
      title: board.title,
      color: board.color,
      icon: board.icon,
      tags: collectTags(cards),
      ...summary,
      lists,
    };
  });

  const tags = new Map<string, ReportTag>();
  for (const board of progressBoards) {
    for (const tag of board.tags) tags.set(tag.id, tag);
  }

  const sortedBoards = progressBoards.sort(
    (a, b) => b.progress - a.progress || b.totalUnits - a.totalUnits
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: reportTotals(sortedBoards),
    tags: [...tags.values()].sort((a, b) => a.name.localeCompare(b.name)),
    boards: sortedBoards,
  };
}
