import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { publicUser } from '../lib/selects';
import { removeStoredFile, storedNameFromUrl, uploadImage } from '../lib/upload';
import {
  clearAuthCookie,
  hashPassword,
  requireAuth,
  setAuthCookie,
  signToken,
  verifyPassword,
} from '../lib/auth';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const parsed = z
    .object({ email: z.string().min(1), password: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Incorrect email or password' });
  if (!user.isActive) return res.status(403).json({ error: 'This account has been deactivated' });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

  const token = signToken(user.id);
  setAuthCookie(res, token);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      title: user.title,
      prefs: user.prefs,
      mustChangePw: user.mustChangePw,
    },
  });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { ...publicUser, prefs: true, mustChangePw: true },
  });
  res.json({ user });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1).max(80).optional(),
      title: z.string().max(120).nullable().optional(),
      avatarColor: z.string().max(32).optional(),
      avatarUrl: z.string().max(500).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile data' });

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: parsed.data,
    select: { ...publicUser, prefs: true },
  });
  res.json({ user });
});

authRouter.put('/prefs', requireAuth, async (req, res) => {
  const prefs = req.body?.prefs ?? {};
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { prefs },
    select: { id: true, prefs: true },
  });
  res.json({ user });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePw: false },
  });
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- avatars */

/** Upload a profile picture. Replaces (and cleans up) any previous one. */
authRouter.post('/avatar', requireAuth, uploadImage.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded' });

  const current = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { avatarUrl: true },
  });

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarUrl: `/api/files/${req.file.filename}` },
    select: { ...publicUser, prefs: true },
  });

  removeStoredFile(storedNameFromUrl(current?.avatarUrl));
  res.json({ user });
});

/** Remove the profile picture and fall back to the coloured initials. */
authRouter.delete('/avatar', requireAuth, async (req, res) => {
  const current = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { avatarUrl: true },
  });

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarUrl: null },
    select: { ...publicUser, prefs: true },
  });

  removeStoredFile(storedNameFromUrl(current?.avatarUrl));
  res.json({ user });
});
