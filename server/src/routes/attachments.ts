import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { publicUser } from '../lib/selects';
import { emitBoard } from '../lib/realtime';
import { cardAudience, logActivity, notify } from '../lib/notify';
import { env } from '../lib/env';
import { kindOf, removeStoredFile, uploadAny } from '../lib/upload';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

/**
 * Upload a file. Always belongs to a card; pass `commentId` as well to hang it
 * off a specific comment instead of the card's own attachment list.
 */
attachmentsRouter.post('/', uploadAny.single('file'), async (req, res) => {
  const file = req.file;
  const cardId = String(req.body?.cardId || '');
  const commentId = req.body?.commentId ? String(req.body.commentId) : null;
  if (!file) return res.status(400).json({ error: 'No file was uploaded' });

  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) {
    removeStoredFile(file.filename);
    return res.status(404).json({ error: 'Card not found' });
  }

  const access = await getBoardAccess(req.user!, card.boardId);
  if (!access?.canEdit) {
    removeStoredFile(file.filename);
    return res.status(403).json({ error: 'You cannot edit this board' });
  }

  if (commentId) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.cardId !== card.id) {
      removeStoredFile(file.filename);
      return res.status(400).json({ error: 'That comment is not on this card' });
    }
    if (comment.authorId !== req.user!.id && !req.user!.can('admin.access')) {
      removeStoredFile(file.filename);
      return res.status(403).json({ error: 'You can only attach files to your own comments' });
    }
  }

  const attachment = await prisma.attachment.create({
    data: {
      cardId: card.id,
      commentId,
      filename: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      kind: kindOf(file.mimetype),
      uploaderId: req.user!.id,
    },
    include: { uploader: { select: publicUser } },
  });

  // the first image attached to the card itself becomes its cover
  if (!commentId && attachment.kind === 'image' && !card.coverType) {
    await prisma.card.update({
      where: { id: card.id },
      data: { coverType: 'image', coverValue: `/api/files/${attachment.storedName}` },
    });
  }

  if (!commentId) {
    await logActivity(
      card.boardId,
      req.user!.id,
      'attachment.added',
      { filename: attachment.filename, title: card.title },
      card.id
    );
    await notify({
      userIds: await cardAudience(card.id),
      actorId: req.user!.id,
      type: 'attachment.added',
      message: `${req.user!.name} attached ${attachment.filename} to "${card.title}"`,
      boardId: card.boardId,
      cardId: card.id,
    });
  }

  emitBoard(card.boardId, 'attachment:created', { cardId: card.id, commentId, attachment });
  res.status(201).json({ attachment });
});

/** Attach an external link instead of a file. */
attachmentsRouter.post('/link', async (req, res) => {
  const parsed = z
    .object({
      cardId: z.string(),
      url: z.string().url(),
      filename: z.string().max(200).optional(),
      commentId: z.string().nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid URL is required' });

  const card = await prisma.card.findUnique({ where: { id: parsed.data.cardId } });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const access = await getBoardAccess(req.user!, card.boardId);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const attachment = await prisma.attachment.create({
    data: {
      cardId: card.id,
      commentId: parsed.data.commentId ?? null,
      filename: parsed.data.filename || parsed.data.url,
      storedName: '',
      mimeType: 'text/uri-list',
      size: 0,
      kind: 'link',
      url: parsed.data.url,
      uploaderId: req.user!.id,
    },
    include: { uploader: { select: publicUser } },
  });

  emitBoard(card.boardId, 'attachment:created', { cardId: card.id, attachment });
  res.status(201).json({ attachment });
});

attachmentsRouter.delete('/:id', async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const card = await prisma.card.findUnique({ where: { id: attachment.cardId } });
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const access = await getBoardAccess(req.user!, card.boardId);
  const allowed = access?.canManage || attachment.uploaderId === req.user!.id;
  if (!access?.canEdit || !allowed)
    return res.status(403).json({ error: 'You cannot remove this attachment' });

  await prisma.attachment.delete({ where: { id: attachment.id } });
  removeStoredFile(attachment.storedName);

  // drop the cover if it pointed at this file
  if (
    attachment.storedName &&
    card.coverType === 'image' &&
    card.coverValue?.endsWith(attachment.storedName)
  ) {
    await prisma.card.update({
      where: { id: card.id },
      data: { coverType: null, coverValue: null },
    });
  }

  emitBoard(card.boardId, 'attachment:deleted', {
    cardId: card.id,
    commentId: attachment.commentId,
    id: attachment.id,
  });
  res.json({ ok: true });
});

/** Serve a stored file. Authentication is required; same-origin cookies included. */
export const filesRouter = Router();
filesRouter.get('/:name', requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  const full = path.join(env.uploadDir, name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(full);
});
