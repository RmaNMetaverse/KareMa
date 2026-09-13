import { prisma } from './prisma';
import { emitBoard } from './realtime';
import { cardInclude } from './selects';

export async function supervisorIds() {
  const users = await prisma.user.findMany({
    where: { isActive: true, roleRef: { key: 'supervisor' } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function invalidateBoardReview(boardId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, isComplete: true, reviewStatus: true },
  });
  if (!board || (!board.isComplete && board.reviewStatus === 'OPEN')) return;

  const updated = await prisma.board.update({
    where: { id: boardId },
    data: {
      isComplete: false,
      reviewStatus: 'OPEN',
      submittedForReviewAt: null,
      submittedById: null,
      reviewedAt: null,
      reviewedById: null,
    },
  });
  emitBoard(boardId, 'board:updated', updated);
}

/** Reopen a changed card, its approved parents, and the board that contains them. */
export async function invalidateCardReview(cardId: string | null) {
  const seen = new Set<string>();
  let currentId = cardId;
  let boardId: string | null = null;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const current = await prisma.card.findUnique({
      where: { id: currentId },
      select: { parentId: true, boardId: true, isComplete: true, reviewStatus: true },
    });
    if (!current) break;
    boardId = current.boardId;
    if (current.isComplete || current.reviewStatus !== 'OPEN') {
      await prisma.card.update({
        where: { id: currentId },
        data: {
          isComplete: false,
          reviewStatus: 'OPEN',
          submittedForReviewAt: null,
          submittedById: null,
          reviewedAt: null,
          reviewedById: null,
        },
      });
      const updated = await prisma.card.findUnique({
        where: { id: currentId },
        include: cardInclude,
      });
      emitBoard(current.boardId, 'card:updated', updated);
    }
    currentId = current.parentId;
  }
  if (boardId) await invalidateBoardReview(boardId);
}
