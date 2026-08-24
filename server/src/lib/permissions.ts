import { prisma } from './prisma';

export type Access = {
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
};

/** Resolve a user's effective access to a board. Global ADMINs get board ADMIN. */
export async function getBoardAccess(userId: string, boardId: string, globalRole: string): Promise<Access | null> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true, isPublic: true } });
  if (!board) return null;

  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });

  let role: Access['role'] | null = membership?.role ?? null;
  if (!role && globalRole === 'ADMIN') role = 'ADMIN';
  if (!role && board.isPublic) role = 'VIEWER';
  if (!role) return null;

  return {
    role,
    canView: true,
    canEdit: role !== 'VIEWER',
    canManage: role === 'OWNER' || role === 'ADMIN',
  };
}

export async function boardIdOfCard(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true } });
  return card?.boardId ?? null;
}
