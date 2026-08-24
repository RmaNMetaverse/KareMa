import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { publicUser } from '../lib/selects';

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ cards: [], boards: [] });

  const isAdmin = req.user!.role === 'ADMIN';
  const visibleBoard = isAdmin
    ? {}
    : { OR: [{ members: { some: { userId: req.user!.id } } }, { isPublic: true }] };

  const [cards, boards] = await Promise.all([
    prisma.card.findMany({
      where: {
        isArchived: false,
        board: visibleBoard,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 30,
      orderBy: { updatedAt: 'desc' },
      include: {
        board: { select: { id: true, title: true, color: true, icon: true } },
        list: { select: { id: true, title: true } },
        assignees: { include: { user: { select: publicUser } } },
        labels: { include: { label: true } },
      },
    }),
    prisma.board.findMany({
      where: { isArchived: false, ...visibleBoard, title: { contains: q, mode: 'insensitive' } },
      take: 10,
      select: { id: true, title: true, color: true, icon: true },
    }),
  ]);

  res.json({ cards, boards });
});
