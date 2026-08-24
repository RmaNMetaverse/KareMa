import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';
import { publicUser } from '../lib/selects';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const onlyUnread = req.query.unread === 'true';
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user!.id, ...(onlyUnread ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        actor: { select: publicUser },
        board: { select: { id: true, title: true, color: true } },
        card: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
  ]);
  res.json({ notifications, unread });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { isRead: true },
  });
  const unread = await prisma.notification.count({ where: { userId: req.user!.id, isRead: false } });
  res.json({ unread });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ unread: 0 });
});

notificationsRouter.delete('/:id', async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  const unread = await prisma.notification.count({ where: { userId: req.user!.id, isRead: false } });
  res.json({ unread });
});

notificationsRouter.delete('/', async (req, res) => {
  await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
  res.json({ unread: 0 });
});
