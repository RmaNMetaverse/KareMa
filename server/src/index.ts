import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { hashPassword } from './lib/auth';
import { initRealtime } from './lib/realtime';
import { ensureRoles } from './lib/roles';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { usersRouter } from './routes/users';
import { boardsRouter } from './routes/boards';
import { listsRouter } from './routes/lists';
import { cardsRouter } from './routes/cards';
import { commentsRouter } from './routes/comments';
import { attachmentsRouter, filesRouter } from './routes/attachments';
import { notificationsRouter } from './routes/notifications';
import { searchRouter } from './routes/search';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Nothing behind /api may be cached by a browser or a proxy in front of us:
// the payloads are per-user and change on every write. Stored files are the
// exception -- their names are unique per upload, so they never change.
app.use('/api', (req, res, next) => {
  res.set(
    'Cache-Control',
    req.path.startsWith('/files/') ? 'private, max-age=31536000, immutable' : 'no-store'
  );
  // responses differ per signed-in user, so they must never be shared between them
  res.set('Vary', 'Authorization');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'karema', version: '1.0.0' }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/lists', listsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/files', filesRouter);
app.use('/api/search', searchRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: `File is larger than the ${env.maxUploadMb} MB limit` });
  // rejections we raised on purpose, e.g. a non-image sent to an image-only route
  if (err?.status >= 400 && err?.status < 500)
    return res.status(err.status).json({ error: err.message });
  console.error('[karema]', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

/** Create the first administrator if the instance has no users yet. */
async function ensureAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;
  const email = env.adminEmail.trim().toLowerCase();
  const administrator = await prisma.role.findUnique({ where: { key: 'administrator' } });
  const admin = await prisma.user.create({
    data: {
      email,
      name: env.adminName,
      passwordHash: await hashPassword(env.adminPassword),
      role: 'ADMIN',
      roleId: administrator?.id,
      avatarColor: '#6366f1',
      mustChangePw: env.adminPassword === 'admin1234',
    },
  });
  console.log(`[karema] created the first administrator: ${email}`);
  await seedWelcomeBoard(admin.id);
}

/** A small starter board so a brand new instance is not an empty page. */
async function seedWelcomeBoard(adminId: string) {
  const board = await prisma.board.create({
    data: {
      title: 'Welcome to KareMa',
      description: 'A short tour. Delete this board whenever you like.',
      color: '#6366f1',
      icon: '👋',
      createdById: adminId,
      members: { create: { userId: adminId, role: 'OWNER', starred: true } },
      labels: {
        create: [
          { name: 'Tip', color: '#0ea5e9' },
          { name: 'Bug', color: '#ef4444' },
          { name: 'Feature', color: '#22c55e' },
          { name: 'Design', color: '#a855f7' },
        ],
      },
      lists: {
        create: [
          { title: 'Start here', position: 1024 },
          { title: 'Try it out', position: 2048 },
          { title: 'Done', position: 3072 },
        ],
      },
    },
    include: { lists: { orderBy: { position: 'asc' } }, labels: true },
  });

  const [start, tryIt, done] = board.lists;
  const tip = board.labels[0];

  const cards: { listId: string; title: string; description?: string; complete?: boolean }[] = [
    {
      listId: start.id,
      title: 'Drag this card to another list',
      description:
        'Cards move by dragging, and so do whole lists — grab the handle next to a list title.\n\nEverything you do here shows up live for anyone else looking at the board.',
    },
    {
      listId: start.id,
      title: 'Open a card to see what it can hold',
      description:
        'A card can carry:\n\n- A description with **bold**, *italic*, `code` and lists\n- Assignees, labels, a priority and dates\n- Checklists\n- Image, video and file attachments (drag files straight onto the card)\n- Comments, where typing @ mentions a teammate',
    },
    {
      listId: start.id,
      title: 'Make it yours in Settings → Appearance',
      description:
        'Pick light, dark, eye-comfort or midnight. Choose your own primary and secondary colours, dial the liquid-glass blur up or down, and set corner radius, density and text size.',
    },
    {
      listId: tryIt.id,
      title: 'Add your team in the Admin panel',
      description:
        'As an administrator you can create accounts, set access levels (Administrator, Member, Guest), reset passwords and deactivate people.\n\nThen add them to a board from Board → Members.',
    },
    {
      listId: tryIt.id,
      title: 'Create your first real board',
      description: 'Use the "New board" button in the sidebar. Starter lists are optional.',
    },
    { listId: done.id, title: 'Install KareMa', complete: true },
  ];

  for (const [i, c] of cards.entries()) {
    const card = await prisma.card.create({
      data: {
        boardId: board.id,
        listId: c.listId,
        title: c.title,
        description: c.description,
        position: (i + 1) * 1024,
        number: i + 1,
        isComplete: c.complete ?? false,
        createdById: adminId,
      },
    });
    if (c.description) {
      await prisma.cardLabel.create({ data: { cardId: card.id, labelId: tip.id } });
    }
  }

  console.log('[karema] created the welcome board');
}

async function start() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  // the database may still be starting up right after `docker compose up`
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (e) {
      if (attempt === 20) throw e;
      console.log(`[karema] waiting for the database (${attempt}/20)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await ensureRoles();
  await ensureAdmin();

  const server = http.createServer(app);
  initRealtime(server);
  server.listen(env.port, () => console.log(`[karema] API listening on port ${env.port}`));
}

start().catch((e) => {
  console.error('[karema] failed to start', e);
  process.exit(1);
});
