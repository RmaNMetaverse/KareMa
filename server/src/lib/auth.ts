import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma';
import { env } from './env';

export type JwtPayload = { uid: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: 'ADMIN' | 'MEMBER' | 'GUEST';
        isActive: boolean;
      };
    }
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signToken(userId: string) {
  return jwt.sign({ uid: userId } as JwtPayload, env.jwtSecret, { expiresIn: '30d' });
}

export function readToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as any).cookies?.karema_token;
  if (cookie) return cookie;
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

export async function loadUser(req: Request) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = readToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await loadUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie('karema_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie('karema_token', { path: '/' });
}
