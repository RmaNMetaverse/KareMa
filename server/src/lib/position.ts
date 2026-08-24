import { prisma } from './prisma';

const STEP = 1024;

/** Position that places an item at `index` among `siblings` (ordered, excluding the item itself). */
export function positionAt(siblings: { position: number }[], index: number): number {
  const i = Math.max(0, Math.min(index, siblings.length));
  const before = i > 0 ? siblings[i - 1].position : null;
  const after = i < siblings.length ? siblings[i].position : null;
  if (before === null && after === null) return STEP;
  if (before === null) return (after as number) - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

export async function cardPosition(listId: string, index: number, excludeCardId?: string) {
  const siblings = await prisma.card.findMany({
    where: { listId, isArchived: false, ...(excludeCardId ? { id: { not: excludeCardId } } : {}) },
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  return positionAt(siblings, index);
}

export async function listPosition(boardId: string, index: number, excludeListId?: string) {
  const siblings = await prisma.list.findMany({
    where: { boardId, isArchived: false, ...(excludeListId ? { id: { not: excludeListId } } : {}) },
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  return positionAt(siblings, index);
}
