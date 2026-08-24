import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { readToken } from './auth';
import { prisma } from './prisma';

let io: IOServer | null = null;

export function initRealtime(server: HttpServer) {
  io = new IOServer(server, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    const raw =
      (socket.handshake.auth as any)?.token ||
      (socket.handshake.query as any)?.token ||
      parseCookie(socket.handshake.headers.cookie || '')['karema_token'];
    const payload = raw ? readToken(String(raw)) : null;
    if (!payload) return next(new Error('unauthorized'));
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user || !user.isActive) return next(new Error('unauthorized'));
    (socket.data as any).userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket.data as any).userId as string;
    socket.join(`user:${userId}`);

    socket.on('board:join', (boardId: string) => {
      if (typeof boardId === 'string') socket.join(`board:${boardId}`);
    });
    socket.on('board:leave', (boardId: string) => {
      if (typeof boardId === 'string') socket.leave(`board:${boardId}`);
    });
  });

  return io;
}

function parseCookie(str: string): Record<string, string> {
  return str.split(';').reduce<Record<string, string>>((acc, part) => {
    const i = part.indexOf('=');
    if (i > -1) acc[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return acc;
  }, {});
}

export function emitBoard(boardId: string, event: string, payload: unknown) {
  io?.to(`board:${boardId}`).emit(event, payload);
}

export function emitUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
