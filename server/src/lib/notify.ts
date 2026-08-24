import { prisma } from './prisma';
import { emitBoard, emitUser } from './realtime';

type NotifyInput = {
  userIds: string[];
  actorId: string;
  type: string;
  message: string;
  boardId?: string | null;
  cardId?: string | null;
  commentId?: string | null;
};

export async function notify({ userIds, actorId, type, message, boardId, cardId, commentId }: NotifyInput) {
  const targets = Array.from(new Set(userIds)).filter((id) => id && id !== actorId);
  if (!targets.length) return;

  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      userId,
      actorId,
      type,
      message,
      boardId: boardId ?? null,
      cardId: cardId ?? null,
      commentId: commentId ?? null,
    })),
  });

  for (const userId of targets) {
    const unread = await prisma.notification.count({ where: { userId, isRead: false } });
    const latest = await prisma.notification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
    });
    emitUser(userId, 'notification:new', { unread, notification: latest });
  }
}

export async function logActivity(
  boardId: string,
  userId: string,
  type: string,
  data: Record<string, unknown> = {},
  cardId?: string | null
) {
  const activity = await prisma.activity.create({
    data: { boardId, cardId: cardId ?? null, userId, type, data: data as any },
    include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
  });
  emitBoard(boardId, 'activity:new', activity);
  return activity;
}

/** Mentions are stored as @[Display Name](userId) */
export function extractMentions(body: string): string[] {
  const ids: string[] = [];
  const re = /@\[[^\]]+\]\(([a-zA-Z0-9_-]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) ids.push(m[1]);
  return Array.from(new Set(ids));
}

/** Everyone who should hear about card changes: assignees + watchers. */
export async function cardAudience(cardId: string): Promise<string[]> {
  const [assignees, watchers] = await Promise.all([
    prisma.cardAssignee.findMany({ where: { cardId }, select: { userId: true } }),
    prisma.cardWatcher.findMany({ where: { cardId }, select: { userId: true } }),
  ]);
  return Array.from(new Set([...assignees.map((a) => a.userId), ...watchers.map((w) => w.userId)]));
}
