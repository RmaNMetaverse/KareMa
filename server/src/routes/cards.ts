import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { getBoardAccess } from '../lib/permissions';
import { cardInclude, commentInclude, publicUser } from '../lib/selects';
import { emitBoard } from '../lib/realtime';
import { cardAudience, logActivity, notify } from '../lib/notify';
import { cardPosition } from '../lib/position';
import { invalidateBoardReview, invalidateCardReview, supervisorIds } from '../lib/review';

export const cardsRouter = Router();
cardsRouter.use(requireAuth);

async function cardAccess(req: any, cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return { card: null, access: null };
  const access = await getBoardAccess(req.user, card.boardId);
  return { card, access };
}

const fullCard = (id: string) => prisma.card.findUnique({ where: { id }, include: cardInclude });

async function completionBlockers(cardId: string) {
  const [uncheckedItems, unfinishedSubtasks] = await Promise.all([
    prisma.checklistItem.count({
      where: { checklist: { cardId }, isDone: false },
    }),
    prisma.card.count({
      where: {
        parentId: cardId,
        isArchived: false,
        OR: [{ isComplete: false }, { reviewStatus: { not: 'APPROVED' } }],
      },
    }),
  ]);
  return { uncheckedItems, unfinishedSubtasks };
}

/** Cards assigned to me, across every board I can see. */
cardsRouter.get('/mine', async (req, res) => {
  const cards = await prisma.card.findMany({
    where: { isArchived: false, assignees: { some: { userId: req.user!.id } } },
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
    include: {
      ...cardInclude,
      board: { select: { id: true, title: true, color: true, icon: true } },
      list: { select: { id: true, title: true } },
    },
  });
  res.json({ cards });
});

/** Create a card. */
cardsRouter.post('/', async (req, res) => {
  const parsed = z
    .object({
      listId: z.string(),
      title: z.string().min(1).max(500),
      index: z.number().int().min(0).optional(),
      description: z.string().max(20000).optional(),
      parentId: z.string().nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A card title is required' });

  const list = await prisma.list.findUnique({ where: { id: parsed.data.listId } });
  if (!list) return res.status(404).json({ error: 'List not found' });

  const access = await getBoardAccess(req.user!, list.boardId);
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const count = await prisma.card.count({ where: { listId: list.id, isArchived: false } });
  const boardCards = await prisma.card.count({ where: { boardId: list.boardId } });
  const position = await cardPosition(list.id, parsed.data.index ?? count);

  const created = await prisma.card.create({
    data: {
      boardId: list.boardId,
      listId: list.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      position,
      number: boardCards + 1,
      parentId: parsed.data.parentId ?? null,
      createdById: req.user!.id,
      watchers: { create: { userId: req.user!.id } },
    },
  });

  const card = await fullCard(created.id);
  await invalidateBoardReview(list.boardId);
  await logActivity(list.boardId, req.user!.id, 'card.created', { title: created.title }, created.id);
  emitBoard(list.boardId, 'card:created', card);
  res.status(201).json({ card });
});

/** One card with its comments and activity. */
cardsRouter.get('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const [full, comments, activities, watchers] = await Promise.all([
    fullCard(card.id),
    prisma.comment.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'asc' },
      include: commentInclude,
    }),
    prisma.activity.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: publicUser } },
    }),
    prisma.cardWatcher.findMany({ where: { cardId: card.id }, select: { userId: true } }),
  ]);

  res.json({
    card: {
      ...full,
      comments,
      activities,
      watchers: watchers.map((w) => w.userId),
      isWatching: watchers.some((w) => w.userId === req.user!.id),
      canEdit: access.canEdit,
    },
  });
});

/** Update card fields. */
/**
 * Every live card beneath this one, nearest first.
 *
 * A sub-task is part of its parent's work rather than a card that merely
 * points at it, so the two travel together: colour and priority flow down,
 * and moving a parent to another list takes its children along.
 */
async function descendants(rootId: string) {
  const found: { id: string; listId: string }[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];

  // depth is capped because parentId is user-supplied; the cycle check on
  // /:id/parent should make that impossible, but this must not hang either way
  for (let depth = 0; depth < 25 && frontier.length; depth++) {
    const children = await prisma.card.findMany({
      where: { parentId: { in: frontier }, isArchived: false },
      orderBy: { position: 'asc' },
      select: { id: true, listId: true },
    });
    const next = children.filter((c) => !seen.has(c.id));
    next.forEach((c) => seen.add(c.id));
    found.push(...next);
    frontier = next.map((c) => c.id);
  }
  return found;
}

cardsRouter.patch('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(20000).nullable().optional(),
      color: z.string().max(32).nullable().optional(),
      coverType: z.enum(['color', 'image', 'gradient']).nullable().optional(),
      coverValue: z.string().max(500).nullable().optional(),
      coverSize: z.enum(['normal', 'full']).optional(),
      priority: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      startDate: z.string().datetime().nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      isComplete: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid card data' });

  const data: any = { ...parsed.data };
  let reviewInvalidated = false;
  if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  if (parsed.data.isComplete === true) {
    const blockers = await completionBlockers(card.id);
    if (blockers.uncheckedItems > 0 || blockers.unfinishedSubtasks > 0) {
      const reasons = [
        blockers.uncheckedItems > 0
          ? `${blockers.uncheckedItems} unchecked checklist ${blockers.uncheckedItems === 1 ? 'item' : 'items'}`
          : null,
        blockers.unfinishedSubtasks > 0
          ? `${blockers.unfinishedSubtasks} unfinished ${blockers.unfinishedSubtasks === 1 ? 'subtask' : 'subtasks'}`
          : null,
      ].filter(Boolean);
      return res.status(400).json({ error: `Finish ${reasons.join(' and ')} before requesting review` });
    }
    data.isComplete = false;
    data.reviewStatus = 'IN_REVIEW';
    data.submittedForReviewAt = new Date();
    data.submittedById = req.user!.id;
    data.reviewedAt = null;
    data.reviewedById = null;
  } else if (parsed.data.isComplete === false) {
    data.isComplete = false;
    data.reviewStatus = 'OPEN';
    data.submittedForReviewAt = null;
    data.submittedById = null;
    data.reviewedAt = null;
    data.reviewedById = null;
  } else if (
    (card.isComplete || card.reviewStatus === 'IN_REVIEW') &&
    Object.keys(parsed.data).length > 0
  ) {
    data.isComplete = false;
    data.reviewStatus = 'OPEN';
    data.submittedForReviewAt = null;
    data.submittedById = null;
    data.reviewedAt = null;
    data.reviewedById = null;
    reviewInvalidated = true;
  }

  await prisma.card.update({ where: { id: card.id }, data });
  if (reviewInvalidated || parsed.data.isComplete !== undefined) {
    await invalidateCardReview(card.parentId);
    await invalidateBoardReview(card.boardId);
  }
  if (parsed.data.isArchived !== undefined) await invalidateBoardReview(card.boardId);
  const updated = await fullCard(card.id);

  // Colour and priority describe the whole group, so they flow down to every
  // sub-task. Anything else stays personal to the card it was set on.
  const inherited: { color?: string | null; priority?: any } = {};
  if (parsed.data.color !== undefined) inherited.color = parsed.data.color;
  if (parsed.data.priority !== undefined) inherited.priority = parsed.data.priority;

  if (Object.keys(inherited).length) {
    const kids = await descendants(card.id);
    if (kids.length) {
      await prisma.card.updateMany({
        where: { id: { in: kids.map((k) => k.id) } },
        data: inherited,
      });
      for (const kid of kids) {
        emitBoard(card.boardId, 'card:updated', await fullCard(kid.id));
      }
    }
  }

  if (parsed.data.isComplete !== undefined) {
    await logActivity(
      card.boardId,
      req.user!.id,
      parsed.data.isComplete ? 'card.review.requested' : 'card.reopened',
      { title: card.title },
      card.id
    );
    const audience = parsed.data.isComplete ? await supervisorIds() : await cardAudience(card.id);
    await notify({
      userIds: audience,
      actorId: req.user!.id,
      type: 'card.status',
      message: parsed.data.isComplete
        ? `${req.user!.name} submitted "${card.title}" for review`
        : `${req.user!.name} reopened "${card.title}"`,
      boardId: card.boardId,
      cardId: card.id,
    });
  }
  if (parsed.data.isArchived === true) {
    await logActivity(card.boardId, req.user!.id, 'card.archived', { title: card.title }, card.id);
  }

  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/** Only a Supervisor can turn reviewed work into actually completed work. */
cardsRouter.post('/:id/review', async (req, res) => {
  if (req.user!.roleKey !== 'supervisor') {
    return res.status(403).json({ error: 'Only a Supervisor can review completed work' });
  }

  const decision = z.enum(['approve', 'reject']).safeParse(req.body?.decision);
  if (!decision.success) return res.status(400).json({ error: 'Choose approve or reject' });

  const card = await prisma.card.findUnique({ where: { id: req.params.id } });
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (card.reviewStatus !== 'IN_REVIEW') {
    return res.status(409).json({ error: 'This card is no longer waiting for review' });
  }

  if (decision.data === 'approve') {
    const blockers = await completionBlockers(card.id);
    if (blockers.uncheckedItems > 0 || blockers.unfinishedSubtasks > 0) {
      return res.status(409).json({ error: 'The work changed and is no longer ready for approval' });
    }
  }

  await prisma.card.update({
    where: { id: card.id },
    data: {
      isComplete: decision.data === 'approve',
      reviewStatus: decision.data === 'approve' ? 'APPROVED' : 'OPEN',
      reviewedAt: new Date(),
      reviewedById: req.user!.id,
    },
  });

  await logActivity(
    card.boardId,
    req.user!.id,
    decision.data === 'approve' ? 'card.review.approved' : 'card.review.rejected',
    { title: card.title },
    card.id
  );
  await notify({
    userIds: [...(await cardAudience(card.id)), ...(card.submittedById ? [card.submittedById] : [])],
    actorId: req.user!.id,
    type: 'card.review',
    message: `${req.user!.name} ${decision.data === 'approve' ? 'approved' : 'returned'} "${card.title}"`,
    boardId: card.boardId,
    cardId: card.id,
  });
  if (decision.data === 'reject') await invalidateCardReview(card.parentId);
  await invalidateBoardReview(card.boardId);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/** Move a card between lists or within a list. */
cardsRouter.patch('/:id/move', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ listId: z.string(), index: z.number().int().min(0) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid move' });

  const target = await prisma.list.findUnique({ where: { id: parsed.data.listId } });
  if (!target || target.boardId !== card.boardId)
    return res.status(400).json({ error: 'Target list is not on this board' });

  const position = await cardPosition(target.id, parsed.data.index, card.id);
  await prisma.card.update({
    where: { id: card.id },
    data: { listId: target.id, position },
  });
  const updated = await fullCard(card.id);

  // Sub-tasks follow their parent, landing directly beneath it so the group
  // stays contiguous in the new list.
  const movedKids: { card: any; fromListId: string }[] = [];
  let slot = parsed.data.index + 1;
  for (const kid of await descendants(card.id)) {
    const kidPosition = await cardPosition(target.id, slot, kid.id);
    await prisma.card.update({
      where: { id: kid.id },
      data: { listId: target.id, position: kidPosition },
    });
    movedKids.push({ card: await fullCard(kid.id), fromListId: kid.listId });
    slot += 1;
  }

  if (target.id !== card.listId) {
    const from = await prisma.list.findUnique({ where: { id: card.listId }, select: { title: true } });
    await logActivity(
      card.boardId,
      req.user!.id,
      'card.moved',
      { title: card.title, from: from?.title, to: target.title },
      card.id
    );
    const audience = await cardAudience(card.id);
    await notify({
      userIds: audience,
      actorId: req.user!.id,
      type: 'card.moved',
      message: `${req.user!.name} moved "${card.title}" to ${target.title}`,
      boardId: card.boardId,
      cardId: card.id,
    });
  }

  emitBoard(card.boardId, 'card:moved', {
    card: updated,
    fromListId: card.listId,
    toListId: target.id,
  });
  // after the parent, so a client applies the group in the order it reads
  for (const kid of movedKids) {
    emitBoard(card.boardId, 'card:moved', {
      card: kid.card,
      fromListId: kid.fromListId,
      toListId: target.id,
    });
  }
  await invalidateBoardReview(card.boardId);
  res.json({ card: updated });
});

cardsRouter.delete('/:id', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.card.delete({ where: { id: card.id } });
  await invalidateCardReview(card.parentId);
  await invalidateBoardReview(card.boardId);
  await logActivity(card.boardId, req.user!.id, 'card.deleted', { title: card.title });
  emitBoard(card.boardId, 'card:deleted', { id: card.id, listId: card.listId });
  res.json({ ok: true });
});

cardsRouter.post('/:id/duplicate', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const boardCards = await prisma.card.count({ where: { boardId: card.boardId } });
  const siblings = await prisma.card.count({ where: { listId: card.listId, isArchived: false } });
  const copy = await prisma.card.create({
    data: {
      boardId: card.boardId,
      listId: card.listId,
      title: `${card.title} (copy)`,
      description: card.description,
      position: await cardPosition(card.listId, siblings),
      color: card.color,
      coverType: card.coverType,
      coverValue: card.coverValue,
      coverSize: card.coverSize,
      priority: card.priority,
      startDate: card.startDate,
      dueDate: card.dueDate,
      number: boardCards + 1,
      createdById: req.user!.id,
    },
  });

  const labels = await prisma.cardLabel.findMany({ where: { cardId: card.id } });
  if (labels.length) {
    await prisma.cardLabel.createMany({
      data: labels.map((l) => ({ cardId: copy.id, labelId: l.labelId })),
    });
  }

  await invalidateBoardReview(card.boardId);
  const full = await fullCard(copy.id);
  emitBoard(card.boardId, 'card:created', full);
  res.status(201).json({ card: full });
});

/* --------------------------------------------------------------- assignees */

cardsRouter.post('/:id/assignees', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const userId = z.string().safeParse(req.body?.userId);
  if (!userId.success) return res.status(400).json({ error: 'Invalid user' });

  await prisma.cardAssignee.upsert({
    where: { cardId_userId: { cardId: card.id, userId: userId.data } },
    create: { cardId: card.id, userId: userId.data },
    update: {},
  });
  await prisma.cardWatcher.upsert({
    where: { cardId_userId: { cardId: card.id, userId: userId.data } },
    create: { cardId: card.id, userId: userId.data },
    update: {},
  });
  await invalidateCardReview(card.id);

  const person = await prisma.user.findUnique({ where: { id: userId.data }, select: publicUser });
  await notify({
    userIds: [userId.data],
    actorId: req.user!.id,
    type: 'card.assigned',
    message: `${req.user!.name} assigned you to "${card.title}"`,
    boardId: card.boardId,
    cardId: card.id,
  });
  await logActivity(card.boardId, req.user!.id, 'card.assigned', { name: person?.name, title: card.title }, card.id);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.delete('/:id/assignees/:userId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.cardAssignee
    .delete({ where: { cardId_userId: { cardId: card.id, userId: req.params.userId } } })
    .catch(() => null);
  await invalidateCardReview(card.id);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/* -------------------------------------------------------------------- tags */

async function toggleCardTag(req: any, res: any) {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const tagId = req.params.tagId ?? req.params.labelId;
  const tag = await prisma.label.findFirst({ where: { id: tagId, boardId: card.boardId } });
  if (!tag) return res.status(404).json({ error: 'Tag not found on this board' });

  const existing = await prisma.cardLabel.findUnique({
    where: { cardId_labelId: { cardId: card.id, labelId: tagId } },
  });
  if (existing) {
    await prisma.cardLabel.delete({ where: { id: existing.id } });
  } else {
    await prisma.cardLabel.create({ data: { cardId: card.id, labelId: tagId } });
  }
  await invalidateCardReview(card.id);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
}

cardsRouter.post('/:id/tags/:tagId', toggleCardTag);
// Legacy endpoint kept so older clients continue to work.
cardsRouter.post('/:id/labels/:labelId', toggleCardTag);

/* -------------------------------------------------------------- checklists */

cardsRouter.post('/:id/checklists', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const title = z.string().min(1).max(120).safeParse(req.body?.title);
  if (!title.success) return res.status(400).json({ error: 'A checklist title is required' });

  const count = await prisma.checklist.count({ where: { cardId: card.id } });
  await prisma.checklist.create({
    data: { cardId: card.id, title: title.data, position: (count + 1) * 1024 },
  });
  await invalidateCardReview(card.id);
  await logActivity(
    card.boardId,
    req.user!.id,
    'checklist.created',
    { checklist: title.data, title: card.title },
    card.id
  );

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.status(201).json({ card: updated });
});

cardsRouter.delete('/:id/checklists/:checklistId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.checklist.delete({ where: { id: req.params.checklistId } }).catch(() => null);
  await invalidateCardReview(card.id);
  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.post('/:id/checklists/:checklistId/items', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const text = z.string().min(1).max(500).safeParse(req.body?.text);
  if (!text.success) return res.status(400).json({ error: 'Item text is required' });

  const count = await prisma.checklistItem.count({ where: { checklistId: req.params.checklistId } });
  await prisma.checklistItem.create({
    data: { checklistId: req.params.checklistId, text: text.data, position: (count + 1) * 1024 },
  });
  await invalidateCardReview(card.id);
  await logActivity(
    card.boardId,
    req.user!.id,
    'checklist.item.added',
    { item: text.data, title: card.title },
    card.id
  );

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.status(201).json({ card: updated });
});

cardsRouter.patch('/:id/checklist-items/:itemId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ text: z.string().min(1).max(500).optional(), isDone: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid item' });

  const before = await prisma.checklistItem.findUnique({
    where: { id: req.params.itemId },
    include: { checklist: { select: { title: true } } },
  });
  if (!before) return res.status(404).json({ error: 'Checklist item not found' });

  await prisma.checklistItem.update({ where: { id: req.params.itemId }, data: parsed.data });
  if (parsed.data.text !== undefined || parsed.data.isDone === false) {
    await invalidateCardReview(card.id);
  }

  // ticking an item is a real event — record who did it and when
  if (parsed.data.isDone !== undefined && parsed.data.isDone !== before.isDone) {
    const items = await prisma.checklistItem.findMany({
      where: { checklistId: before.checklistId },
      select: { isDone: true },
    });
    const done = items.filter((i) => i.isDone).length;

    await logActivity(
      card.boardId,
      req.user!.id,
      parsed.data.isDone ? 'checklist.checked' : 'checklist.unchecked',
      {
        item: before.text,
        checklist: before.checklist.title,
        title: card.title,
        done,
        total: items.length,
      },
      card.id
    );

    // a finished checklist is worth telling the card's watchers about
    if (parsed.data.isDone && done === items.length && items.length > 0) {
      await notify({
        userIds: await cardAudience(card.id),
        actorId: req.user!.id,
        type: 'checklist.completed',
        message: `${req.user!.name} finished "${before.checklist.title}" on "${card.title}"`,
        boardId: card.boardId,
        cardId: card.id,
      });
    }
  } else if (parsed.data.text !== undefined) {
    await logActivity(
      card.boardId,
      req.user!.id,
      'checklist.item.edited',
      { item: parsed.data.text, was: before.text, title: card.title },
      card.id
    );
  }

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.post('/:id/checklist-items/:itemId/tags/:tagId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const [item, tag] = await Promise.all([
    prisma.checklistItem.findFirst({
      where: { id: req.params.itemId, checklist: { cardId: card.id } },
      select: { id: true },
    }),
    prisma.label.findFirst({
      where: { id: req.params.tagId, boardId: card.boardId },
      select: { id: true },
    }),
  ]);
  if (!item) return res.status(404).json({ error: 'Checklist item not found on this card' });
  if (!tag) return res.status(404).json({ error: 'Tag not found on this board' });

  const existing = await prisma.checklistItemTag.findUnique({
    where: {
      checklistItemId_labelId: { checklistItemId: item.id, labelId: tag.id },
    },
  });
  if (existing) {
    await prisma.checklistItemTag.delete({ where: { id: existing.id } });
  } else {
    await prisma.checklistItemTag.create({
      data: { checklistItemId: item.id, labelId: tag.id },
    });
  }
  await invalidateCardReview(card.id);

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

cardsRouter.delete('/:id/checklist-items/:itemId', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  await prisma.checklistItem.delete({ where: { id: req.params.itemId } }).catch(() => null);
  await invalidateCardReview(card.id);
  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  res.json({ card: updated });
});

/* ------------------------------------------------------------------ watch */

cardsRouter.post('/:id/watch', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const existing = await prisma.cardWatcher.findUnique({
    where: { cardId_userId: { cardId: card.id, userId: req.user!.id } },
  });
  if (existing) {
    await prisma.cardWatcher.delete({ where: { id: existing.id } });
    return res.json({ isWatching: false });
  }
  await prisma.cardWatcher.create({ data: { cardId: card.id, userId: req.user!.id } });
  res.json({ isWatching: true });
});

/* -------------------------------------------------------------- hierarchy */

/** Walk up the parent chain to make sure a move would not create a loop. */
async function wouldCycle(cardId: string, candidateParentId: string) {
  let cursor: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === cardId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent: { parentId: string | null } | null = await prisma.card.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

/** Attach a card to a parent, or pass null to make it top-level again. */
cardsRouter.patch('/:id/parent', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z.object({ parentId: z.string().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid parent' });

  const parentId = parsed.data.parentId;

  if (parentId) {
    if (parentId === card.id)
      return res.status(400).json({ error: 'A card cannot be its own parent' });

    const parent = await prisma.card.findUnique({ where: { id: parentId } });
    if (!parent) return res.status(404).json({ error: 'That parent card no longer exists' });
    if (parent.boardId !== card.boardId)
      return res.status(400).json({ error: 'A parent has to be on the same board' });
    if (await wouldCycle(card.id, parentId))
      return res.status(400).json({ error: 'That would put the card inside one of its own subtasks' });
  }

  await prisma.card.update({ where: { id: card.id }, data: { parentId } });
  await invalidateCardReview(card.id);
  if (card.parentId && card.parentId !== parentId) await invalidateCardReview(card.parentId);

  const parentTitle = parentId
    ? (await prisma.card.findUnique({ where: { id: parentId }, select: { title: true } }))?.title
    : null;
  await logActivity(
    card.boardId,
    req.user!.id,
    parentId ? 'card.parent.set' : 'card.parent.cleared',
    { title: card.title, parent: parentTitle },
    card.id
  );

  const updated = await fullCard(card.id);
  emitBoard(card.boardId, 'card:updated', updated);
  if (parentId) {
    const parentCard = await fullCard(parentId);
    emitBoard(card.boardId, 'card:updated', parentCard);
  }
  res.json({ card: updated });
});

/** Create a subtask under this card, in the same list by default. */
cardsRouter.post('/:id/subtasks', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access?.canEdit) return res.status(403).json({ error: 'You cannot edit this board' });

  const parsed = z
    .object({ title: z.string().min(1).max(500), listId: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A subtask title is required' });

  const listId = parsed.data.listId ?? card.listId;
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list || list.boardId !== card.boardId)
    return res.status(400).json({ error: 'That list is not on this board' });

  const siblings = await prisma.card.count({ where: { listId, isArchived: false } });
  const boardCards = await prisma.card.count({ where: { boardId: card.boardId } });

  const created = await prisma.card.create({
    data: {
      boardId: card.boardId,
      listId,
      title: parsed.data.title.trim(),
      position: await cardPosition(listId, siblings),
      number: boardCards + 1,
      parentId: card.id,
      // start life matching the parent, the same way a later change to the
      // parent's colour or priority will flow down to it
      color: card.color,
      priority: card.priority,
      createdById: req.user!.id,
      watchers: { create: { userId: req.user!.id } },
    },
  });
  await invalidateCardReview(card.id);

  await logActivity(
    card.boardId,
    req.user!.id,
    'card.subtask.added',
    { title: created.title, parent: card.title },
    created.id
  );

  const [subtask, parent] = await Promise.all([fullCard(created.id), fullCard(card.id)]);
  emitBoard(card.boardId, 'card:created', subtask);
  emitBoard(card.boardId, 'card:updated', parent);
  res.status(201).json({ card: subtask, parent });
});

/** Candidate parents: every other top-level-ish card on the same board. */
cardsRouter.get('/:id/parent-options', async (req, res) => {
  const { card, access } = await cardAccess(req, req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!access) return res.status(403).json({ error: 'No access to this card' });

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const candidates = await prisma.card.findMany({
    where: {
      boardId: card.boardId,
      isArchived: false,
      id: { not: card.id },
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: { number: 'asc' },
    take: 60,
    select: { id: true, title: true, number: true, parentId: true, listId: true },
  });

  // drop anything that lives underneath this card
  const allowed = [];
  for (const c of candidates) {
    if (!(await wouldCycle(card.id, c.id))) allowed.push(c);
  }
  res.json({ cards: allowed });
});
