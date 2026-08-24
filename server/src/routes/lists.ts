import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { emitBoard } from '../lib/realtime';
import { logActivity } from '../lib/notify';
import { listPosition, cardPosition } from '../lib/position';

export const listsRouter = Router();
listsRouter.use(requireAuth);

async function listAccess(req: any, listId: string) {
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list) return { list: null, access: null };
  const access = await getBoardAccess(req.user, list.boardId);
  return { list, access };
}

listsRouter.patch('/:id', async (req, res) => {
  const { list, access } = await listAccess(req, req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({
      title: z.string().min(1).max(120).optional(),
      color: z.string().max(32).nullable().optional(),
      wipLimit: z.number().int().min(0).nullable().optional(),
      isCollapsed: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid list data' });

  const updated = await prisma.list.update({ where: { id: list.id }, data: parsed.data });
  emitBoard(list.boardId, 'list:updated', updated);
  res.json({ list: updated });
});

/** Reorder a list within its board. */
listsRouter.patch('/:id/move', async (req, res) => {
  const { list, access } = await listAccess(req, req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const index = z.number().int().min(0).safeParse(req.body?.index);
  if (!index.success) return res.status(400).json({ error: 'Invalid position' });

  const position = await listPosition(list.boardId, index.data, list.id);
  const updated = await prisma.list.update({ where: { id: list.id }, data: { position } });
  emitBoard(list.boardId, 'list:moved', { id: list.id, position: updated.position });
  res.json({ list: updated });
});

listsRouter.delete('/:id', async (req, res) => {
  const { list, access } = await listAccess(req, req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.list.delete({ where: { id: list.id } });
  await logActivity(list.boardId, req.user!.id, 'list.deleted', { title: list.title });
  emitBoard(list.boardId, 'list:deleted', { id: list.id });
  res.json({ ok: true });
});

/** Archive every card in a list at once. */
listsRouter.post('/:id/archive-cards', async (req, res) => {
  const { list, access } = await listAccess(req, req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.card.updateMany({ where: { listId: list.id }, data: { isArchived: true } });
  emitBoard(list.boardId, 'list:cards-archived', { id: list.id });
  res.json({ ok: true });
});

/** Duplicate a list together with its cards. */
listsRouter.post('/:id/duplicate', async (req, res) => {
  const { list, access } = await listAccess(req, req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const count = await prisma.list.count({ where: { boardId: list.boardId, isArchived: false } });
  const position = await listPosition(list.boardId, count);
  const copy = await prisma.list.create({
    data: {
      boardId: list.boardId,
      title: `${list.title} (copy)`,
      color: list.color,
      wipLimit: list.wipLimit,
      position,
    },
  });

  const cards = await prisma.card.findMany({
    where: { listId: list.id, isArchived: false },
    orderBy: { position: 'asc' },
  });
  for (const [i, card] of cards.entries()) {
    await prisma.card.create({
      data: {
        boardId: list.boardId,
        listId: copy.id,
        title: card.title,
        description: card.description,
        position: await cardPosition(copy.id, i),
        color: card.color,
        coverType: card.coverType,
        coverValue: card.coverValue,
        coverSize: card.coverSize,
        priority: card.priority,
        startDate: card.startDate,
        dueDate: card.dueDate,
        createdById: req.user!.id,
      },
    });
  }

  emitBoard(list.boardId, 'board:refresh', { reason: 'list-duplicated' });
  res.status(201).json({ list: copy });
});
