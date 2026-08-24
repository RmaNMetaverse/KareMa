# Contributing to KareMa

Thanks for taking a look. KareMa is a small, self-hosted project management tool,
and it is meant to stay small enough that one person can read the whole thing.

## Getting a development environment

You need Docker (for Postgres) and Node 22+.

```bash
# 1. database only
docker compose up -d db

# 2. API, with reload
cd server
npm install
export DATABASE_URL="postgresql://karema:karema_dev_password@localhost:5432/karema?schema=public"
npx prisma db push
npm run dev            # http://localhost:4000

# 3. frontend, with hot reload
cd ../web
npm install
npm run dev            # http://localhost:5173, proxies /api to :4000
```

To reach Postgres from outside Docker, add `ports: ["5432:5432"]` to the `db`
service in `docker-compose.yml` while you are developing.

## Before you open a pull request

```bash
cd server && npx tsc --noEmit
cd ../web  && npx tsc --noEmit && npx vite build
```

Then run the real stack (`docker compose up -d --build`) and click through what you
changed. CI runs all of the above plus a boot-and-smoke-test of the Docker stack.

## House style

- **Match the surrounding code.** Same naming, same comment density, same idioms.
- **Comments explain why, not what.** If a line needs a comment to say what it does,
  the line usually wants rewriting instead.
- **Copy is part of the UI.** Error and empty-state text should read like a person
  wrote it: plain, specific, no exclamation marks, no blame.
- **Every colour comes from a token.** Never hard-code a hex in a component — use the
  CSS variables (`--primary`, `--surface`, `--text`, ...) or their Tailwind aliases
  (`bg-surface`, `text-muted`, `border-line`). Anything hard-coded breaks the four
  colour modes and the user's chosen accent.
- **Check all four modes** for UI work: light, dark, eye comfort, midnight — and once
  with liquid glass switched off.
- **Do not put a `ring-*` utility on a `.glass` element.** The glass box-shadow paints
  over it; use `outline` instead.

## Changing the database

Edit `server/prisma/schema.prisma`, then:

```bash
cd server && npx prisma db push && npx prisma generate
```

The API container runs `prisma db push` on boot, so a rebuild applies your change on
other machines. Keep changes additive where you can — `db push` will drop a column
that disappears from the schema, and the data with it.

## Reporting security problems

Please do not open a public issue for a security problem. See [SECURITY.md](SECURITY.md).
