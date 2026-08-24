import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { publicUser } from '../lib/selects';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: publicUser,
    take: 100,
  });
  res.json({ users });
});
