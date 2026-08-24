import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { commentInclude } from '../lib/selects';
import { emitBoard } from '../lib/realtime';
import { cardAudience, extractMentions, logActivity, notify } from '../lib/notify';

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

commentsRouter.get('/', async (req, res) => {
  const cardId = String(req.query.cardId || '');
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const access = await getBoardAccess(req.user!.id, card.boardId, req.user!.role);
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const comments = await prisma.comment.findMany({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    include: commentInclude,
  });
  res.json({ comments });
});

commentsRouter.post('/', async (req, res) => {
  const parsed = z
    .object({ cardId: z.string(), body: z.string().min(1).max(10000) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A comment cannot be empty' });

  const card = await prisma.card.findUnique({ where: { id: parsed.data.cardId } });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const access = await getBoardAccess(req.user!.id, card.boardId, req.user!.role);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot comment on this board' });

  const comment = await prisma.comment.create({
    data: { cardId: card.id, authorId: req.user!.id, body: parsed.data.body },
    include: commentInclude,
  });

  // the commenter starts watching the card
  await prisma.cardWatcher
    .upsert({
      where: { cardId_userId: { cardId: card.id, userId: req.user!.id } },
      create: { cardId: card.id, userId: req.user!.id },
      update: {},
    })
    .catch(() => null);

  const mentioned = extractMentions(parsed.data.body);
  if (mentioned.length) {
    await notify({
      userIds: mentioned,
      actorId: req.user!.id,
      type: 'comment.mention',
      message: `${req.user!.name} mentioned you on "${card.title}"`,
      boardId: card.boardId,
      cardId: card.id,
      commentId: comment.id,
    });
  }

  const audience = (await cardAudience(card.id)).filter((id) => !mentioned.includes(id));
  await notify({
    userIds: audience,
    actorId: req.user!.id,
    type: 'comment.new',
    message: `${req.user!.name} commented on "${card.title}"`,
    boardId: card.boardId,
    cardId: card.id,
    commentId: comment.id,
  });

  await logActivity(card.boardId, req.user!.id, 'comment.added', { title: card.title }, card.id);
  emitBoard(card.boardId, 'comment:created', { cardId: card.id, comment });
  res.status(201).json({ comment });
});

commentsRouter.patch('/:id', async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.authorId !== req.user!.id && req.user!.role !== 'ADMIN')
    return res.status(403).json({ error: 'You can only edit your own comments' });

  const body = z.string().min(1).max(10000).safeParse(req.body?.body);
  if (!body.success) return res.status(400).json({ error: 'A comment cannot be empty' });

  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { body: body.data, isEdited: true },
    include: commentInclude,
  });

  const card = await prisma.card.findUnique({ where: { id: comment.cardId } });
  if (card) emitBoard(card.boardId, 'comment:updated', { cardId: card.id, comment: updated });
  res.json({ comment: updated });
});

commentsRouter.delete('/:id', async (req, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const card = await prisma.card.findUnique({ where: { id: comment.cardId } });
  const access = card ? await getBoardAccess(req.user!.id, card.boardId, req.user!.role) : null;
  const allowed = comment.authorId === req.user!.id || req.user!.role === 'ADMIN' || access?.canManage;
  if (!allowed) return res.status(403).json({ error: 'You cannot delete this comment' });

  await prisma.comment.delete({ where: { id: comment.id } });
  if (card) emitBoard(card.boardId, 'comment:deleted', { cardId: card.id, id: comment.id });
  res.json({ ok: true });
});
