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

export type ListProgress = ProgressMetrics & {
  id: string;
  title: string;
  color: string | null;
};

export type BoardProgress = ProgressMetrics & {
  id: string;
  title: string;
  color: string;
  icon: string | null;
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
  boards: BoardProgress[];
};

type ProgressCard = {
  isComplete: boolean;
  parentId: string | null;
  checklists: { items: { isDone: boolean }[] }[];
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
              checklists: {
                select: { items: { select: { isDone: true } } },
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
      ...summariseProgress(list.cards),
    }));
    const summary = summariseProgress(board.lists.flatMap((list) => list.cards));

    return {
      id: board.id,
      title: board.title,
      color: board.color,
      icon: board.icon,
      ...summary,
      lists,
    };
  });

  const totals = progressBoards.reduce(
    (sum, board) => ({
      totalUnits: sum.totalUnits + board.totalUnits,
      completedUnits: sum.completedUnits + board.completedUnits,
      remainingUnits: sum.remainingUnits + board.remainingUnits,
    }),
    { totalUnits: 0, completedUnits: 0, remainingUnits: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      ...totals,
      progress: totals.totalUnits
        ? Math.round((totals.completedUnits / totals.totalUnits) * 100)
        : 0,
      boards: progressBoards.length,
      completeBoards: progressBoards.filter(
        (board) => board.totalUnits > 0 && board.remainingUnits === 0
      ).length,
      emptyBoards: progressBoards.filter((board) => board.totalUnits === 0).length,
    },
    boards: progressBoards.sort(
      (a, b) => b.progress - a.progress || b.totalUnits - a.totalUnits
    ),
  };
}
