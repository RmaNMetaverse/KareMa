<h1 align="center">KareMa</h1>

<p align="center">
  <b>A self-hosted project board for small teams.</b><br>
  Trello's feel, the parts of Jira you actually use, and an interface you can bend to your own taste.<br>
  Your database, your files, your machine.
</p>

<p align="center">
  <a href="https://github.com/RmaNMetaverse/KareMa/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/RmaNMetaverse/KareMa/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-blue.svg"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-docker-2496ed?logo=docker&logoColor=white">
  <img alt="Windows, macOS, Linux" src="https://img.shields.io/badge/runs%20on-Windows%20%7C%20macOS%20%7C%20Linux-444">
</p>

![The KareMa board](docs/screenshots/board-dark.png)

<p align="center"><sub>All screenshots show demo data from a throwaway instance.</sub></p>

---

## Why this exists

Small studios keep outgrowing sticky notes and keep bouncing off the price, the account
management and the cloud-only storage of the big tools. KareMa is the middle: a real
kanban board with assignees, attachments, comments and notifications, that runs on one
machine in your office and takes one double-click to start.

- **One command to deploy.** Docker does the rest — database, file storage, web server.
- **Nothing leaves the building.** No accounts to create anywhere, no telemetry, no bill.
- **Small enough to read.** ~14k lines of TypeScript across an API and a React app.

---

## What it does

### Boards that feel right

<img src="docs/screenshots/board-light.png" alt="A board in light mode">

Drag cards between lists, drag lists to reorder them, and watch everyone else's changes
land on your screen as they happen — no refresh, no lost work.

- **Cards carry the whole story**: description, assignees, labels, priority, start and
  due dates, checklists, attachments, comments and a full activity trail
- **Card colours, colour and gradient covers, image covers** — normal or full-bleed
- **Per-list WIP limits** that turn red when you go over, plus list colours, duplicate a
  list with its cards, and archive a whole list's cards at once
- **Filter by** member, label, priority, due date or free text, with a live count of
  what is hidden
- **Search everything** with `Ctrl` + `K` from anywhere
- **My work** gathers every card assigned to you across all boards, grouped by urgency

### Two ways to look at the same work

<img src="docs/screenshots/list-view.png" alt="The Jira-style list view">

Every board flips between the **Kanban board** and a **list view** modelled on Jira's,
with one click in the header. The list is not a read-only export — it is the same board:

- Sortable columns for key, summary, status, priority, assignee and due date
- **Change status or priority inline** from the row; changing status moves the card
  between lists exactly as dragging it would
- **Sub-tasks nest under their parent** and fold away with a chevron
- Card key (`#13`), comment and attachment counts, labels and avatars all in one line
- Your choice of view is remembered per board

### Cards inside cards

<img src="docs/screenshots/card-subtasks.png" alt="A card with sub-tasks and a rich description">

Any card can be the parent of any other card on the same board. Break an epic into
sub-tasks from the card itself, attach an existing card to a parent, or detach it again.
The parent shows a progress bar and a live `2/4` count, each child links straight to its
own card, and a breadcrumb on the child points back up. Cycles are refused, and deleting
a parent leaves its children standing on their own rather than taking them with it.

### A real editor for descriptions and comments

<img src="docs/screenshots/rich-editor.png" alt="The rich text editor toolbar">

Descriptions and comments get a formatting toolbar: **bold**, *italic*, `inline code`,
headings, bulleted, numbered and task lists, quotes, fenced code blocks and links —
with `Ctrl` + `B` / `I` / `E` / `K` shortcuts and a **Preview** tab. It writes plain
markdown, so what you type stays readable and portable, and `@mentions` keep working
inside it.

### Conversations that carry their evidence

<img src="docs/screenshots/card-comments.png" alt="A comment thread with attached frame captures">

Comments support `@mentions` with autocomplete, light markdown, and **files attached to
individual comments** — drop a crash log, a frame capture or a repro video straight into
the reply that talks about it. Images preview inline, video and audio get a player,
everything else downloads.

Mentions, assignments, replies, card moves and board invitations all raise a live
notification, so nobody has to go looking.

### Profile pictures

<img src="docs/screenshots/profile.png" alt="The profile settings page">

Everyone can upload their own picture — drag it onto the avatar or pick a file. No
picture is a perfectly good choice too: KareMa falls back to coloured initials in a
colour you choose.

### An admin panel that answers "how is everyone doing?"

<img src="docs/screenshots/admin-review.png" alt="The per-user review panel">

Administrators get a **work review for any person on the instance**: what is assigned,
what is finished, what is late, their completion rate, a day-by-day activity chart over
7 / 30 / 90 days, a per-board breakdown, and their full open, completed and activity
lists — every row linking straight to the card.

The rest of the panel handles the ordinary things: create accounts, set access levels,
reset passwords, deactivate or delete people, and see every board, card and byte of
attachment storage on the instance.

### Roles you define yourself

<img src="docs/screenshots/admin-roles.png" alt="The roles tab of the admin panel">

KareMa ships with three built-in roles — **Administrator**, **Member** and **Guest** —
but an administrator can create as many more as the studio needs: *Producer*,
*Tech Artist*, *Publisher QA*, whatever fits. Each role is a named colour plus a set of
permissions:

| Permission | What it grants |
| --- | --- |
| `admin.access` | Open the admin panel |
| `users.manage` | Create, edit, deactivate and delete people |
| `roles.manage` | Add, edit and delete roles |
| `reports.view` | Review anyone's work |
| `labels.manage` | Edit the label presets |
| `boards.create` | Create new boards |
| `boards.viewAll` | See every board on the instance |
| `boards.deleteAny` | Delete any board |

Board membership stays separate — that is still set per board as Owner, Admin, Member or
Viewer. Changing a role takes effect on the next request, no re-login needed.

The same tab holds the **label presets**: the labels every new board starts with, edited
once instead of on every board.

New accounts can be handed a temporary password; that person is then required to choose
their own the first time they sign in. The last active administrator can never be
demoted, deactivated or deleted, so an instance can't lock itself out.

### An interface you can actually tune

<img src="docs/screenshots/appearance.png" alt="The appearance settings page">

This is the part people notice. Everything below is live — no reload, no save button —
and it follows your account to whatever machine you sign in from.

**Four colour modes**, plus *match system*:

| | |
| :---: | :---: |
| **Dark** <br> <img src="docs/screenshots/board-dark.png" width="420" alt="Dark mode"> | **Light** <br> <img src="docs/screenshots/board-light.png" width="420" alt="Light mode"> |
| **Eye comfort** — warm, low blue light <br> <img src="docs/screenshots/board-warm.png" width="420" alt="Eye comfort mode"> | **Midnight** — true black for OLED <br> <img src="docs/screenshots/board-midnight.png" width="420" alt="Midnight mode"> |

- **Your own primary and secondary colours.** Pick from a palette or type any hex value.
  Everything else derives from them, including an automatic readable-text calculation so
  labels on your colour stay legible.
- **Liquid glass.** Frosted, translucent panels with a specular sheen along the top edge,
  with independent sliders for **blur**, **opacity** and **sheen** — or switch it off
  entirely for flat, fully opaque surfaces on older hardware.
- **Shape and size.** Corner radius, interface density (compact / cozy / roomy), text
  size, ambient background strength, and an animations toggle for anyone who would
  rather things held still.
- **A picture behind your board.** Give any board a background image from its settings.
  It renders blurred behind the lists so a busy photo still leaves the cards readable,
  and how soft it looks is a slider here — sharp at 0, fully diffused at 60. The picture
  belongs to the board and is shared; the blur is yours alone.
- **Seven presets** to start from: Nebula, Daylight, Amber Desk, Midnight, Forest,
  Sunset and Paper.

Every mode was checked for contrast: body text sits between 11:1 and 17:1, and secondary
text clears WCAG AA in all four.

---

## Quick start

You need **[Docker](https://www.docker.com/products/docker-desktop)**. That is the only
thing to install — Node, PostgreSQL and nginx all live inside the containers.

```bash
git clone https://github.com/RmaNMetaverse/KareMa.git
cd KareMa
```

Then follow your platform below. The first run takes a few minutes while the images
build; after that it starts in seconds.

### Windows

Install [Docker Desktop](https://www.docker.com/products/docker-desktop) and start it —
wait for the whale icon in the tray to stop animating. Then:

**Double-click `start.bat`.**

That is the whole install. It checks Docker is running, generates a unique `JWT_SECRET`
for your instance, builds, waits for the app to answer, and opens your browser.

| File | What it does |
| --- | --- |
| `start.bat` | Start (or build and start) KareMa and open it |
| `stop.bat` | Stop it. All data is kept |
| `logs.bat` | Follow the live logs — first place to look if something is wrong |
| `update.bat` | Rebuild after changing the source. All data is kept |
| `backup.bat` | Write the database and every attachment into `backups\<date-time>\` |
| `restore.bat` | Restore from a backup: `restore.bat backups\2026-01-31_09-15` |
| `uninstall.bat` | Remove the containers **and all data**. Asks you to type `DELETE` |

### macOS

Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop) (works
on both Apple Silicon and Intel), start it, then:

```bash
chmod +x karema.sh     # only needed once
./karema.sh start
```

### Linux

Install Docker Engine and the Compose plugin — on Debian or Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # then log out and back in
```

Then:

```bash
chmod +x karema.sh     # only needed once
./karema.sh start
```

To have it come back after a reboot, enable Docker itself — the containers are already
marked `restart: unless-stopped`:

```bash
sudo systemctl enable --now docker
```

### The `karema.sh` commands (macOS and Linux)

```bash
./karema.sh start        # build if needed, start, open the browser
./karema.sh stop         # stop, keeping all data
./karema.sh restart
./karema.sh logs         # follow the logs
./karema.sh status       # what is running
./karema.sh update       # rebuild from the current source, keeping all data
./karema.sh backup       # database + attachments into ./backups/<date>
./karema.sh restore backups/2026-01-31_09-15
./karema.sh uninstall    # remove containers AND all data
```

### Any platform, without the helper scripts

```bash
cp .env.example .env
# edit .env — at minimum, set a real JWT_SECRET
docker compose up -d --build
```

Then open <http://localhost:8080>.

---

## Your first five minutes

1. Open <http://localhost:8080> and sign in with the account from `.env`:
   `admin@karema.local` / `admin1234`.
2. KareMa immediately asks you to choose a real password. Do that.
3. You land on a **Welcome to KareMa** board that walks through the features. Delete it
   whenever you like.
4. Open **Admin panel → Users → New user** and create accounts for your team. Give each
   one a temporary password; they will be asked to change it when they first sign in.
5. Make a board, then **Board → Members** to add people to it.
6. Send everyone to **Settings → Appearance** so they can make it theirs.

---

## Sharing it with your team

Once it runs on one machine, everyone else on the same network opens:

```
http://THAT-MACHINES-NAME:8080
```

or `http://192.168.x.x:8080` using its local IP (`ipconfig` on Windows, `ip addr` or
`ifconfig` elsewhere).

If nobody can connect, the firewall is almost always the reason.

**Windows** — run once in an administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "KareMa" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

**Linux (ufw)**:

```bash
sudo ufw allow 8080/tcp
```

**macOS** — allow incoming connections for Docker when the system prompts, or in
System Settings → Network → Firewall → Options.

### Behind a reverse proxy, or beside an existing site

KareMa can live under a sub-path — `http://your-server/KareMa` — on a machine that
already serves something else, without disturbing that application. Set `BASE_PATH`,
bind the port to loopback, and point the host's nginx at it.

**[DEPLOY.md](DEPLOY.md)** walks through it end to end on Ubuntu: the nginx snippets to
drop in, why the existing site stays untouched, how to update after every push, and a
Docker-free variant that uses the Node and nginx already on the box.

---

## Configuration

Everything lives in `.env`, next to `docker-compose.yml`. Change a value, then run
`update.bat` / `./karema.sh update` (or `docker compose up -d`) to apply it.

| Setting | Default | Notes |
| --- | --- | --- |
| `KAREMA_PORT` | `8080` | The port you open in a browser |
| `KAREMA_BIND` | `0.0.0.0` | Which host interface that port is published on. Set to `127.0.0.1` when a reverse proxy sits in front |
| `BASE_PATH` | `/` | Where KareMa lives in the URL. `/KareMa/` serves it under a sub-path, see [DEPLOY.md](DEPLOY.md). Changing it needs `docker compose up -d --build web` |
| `JWT_SECRET` | generated on first run | Changing it signs everyone out |
| `ADMIN_EMAIL` | `admin@karema.local` | Only used to create the very first account |
| `ADMIN_PASSWORD` | `admin1234` | Only used once; you are forced to change it at first sign-in |
| `ADMIN_NAME` | `Administrator` | Only used once |
| `MAX_UPLOAD_MB` | `100` | Per-file attachment limit |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `karema` | The database is never exposed outside Docker |

If you raise `MAX_UPLOAD_MB` above 512, also raise `client_max_body_size` in
`web/nginx.conf.template`.

---

## Where your data lives

Two Docker volumes, which survive rebuilds and `docker compose down`:

- `karema_karema_db` — the PostgreSQL database
- `karema_karema_files` — every uploaded attachment and profile picture

Only `uninstall.bat` / `./karema.sh uninstall` (or `docker compose down -v`) deletes them.

**Backups** copy both into a dated folder:

```bash
./karema.sh backup            # or double-click backup.bat on Windows
# -> backups/2026-01-31_09-15/database.sql
# -> backups/2026-01-31_09-15/attachments.tar.gz
```

Copy that folder somewhere else — a NAS, another drive, wherever your studio keeps
backups. Restoring is one command, and asks you to type `RESTORE` before it replaces
anything.

---

## Running it for real

The same `docker compose up -d` works unchanged on a Linux server. Two things are worth
doing there:

1. **Put TLS in front.** Point a reverse proxy at the `web` container's port 80. With
   Caddy that is a two-line `Caddyfile`:

   ```
   boards.yourstudio.com {
       reverse_proxy localhost:8080
   }
   ```

   Then set `secure: true` on the session cookie in `server/src/lib/auth.ts`.

2. **Use a real `JWT_SECRET`.** The helper scripts generate one; by hand it is
   `openssl rand -base64 48`.

See [SECURITY.md](SECURITY.md) for what KareMa assumes about its network, and what it
deliberately does not do.

---

## How it is built

```
server/                    Node 22 · TypeScript · Express · Prisma · Socket.IO
  prisma/schema.prisma     the entire data model, one file
  src/lib/                 auth, roles, permissions, realtime, notifications,
                           uploads, ordering
  src/routes/              auth · admin · users · boards · lists · cards
                           comments · attachments · notifications · search
web/                       React 18 · TypeScript · Vite · Tailwind · dnd-kit
  src/lib/theme.ts         the theming engine — modes, colours, glass, density
  src/lib/utils.ts         the markdown renderer behind descriptions and comments
  src/styles/index.css     design tokens, liquid glass, component classes
  src/components/board/    card tile, list column, card modal, list view,
                           rich text editor, sub-tasks, comments, pickers
  src/components/admin/    the roles tab and the per-user review panel
  src/pages/               login · dashboard · board · my work · settings · admin
```

Three containers: `db` (PostgreSQL 16), `api` (the Node server), `web` (nginx serving
the built frontend and proxying `/api` and `/socket.io`).

A few decisions worth knowing about:

- **Fractional ordering.** Cards and lists store a floating-point `position`, so moving
  one card writes one row instead of renumbering everything after it.
- **Schema on boot.** The API runs `prisma db push` when it starts, so upgrading is
  `git pull` + `update.bat`. There is no migration history to manage — the trade-off is
  that a schema change which drops a column drops its data.
- **Permissions are server-side, always.** Every route re-derives the caller's access to
  the board in question. The frontend hiding a button is never what protects the data.
- **Comment attachments are card attachments with a `commentId`.** They stay out of the
  card's own attachment list, and they are cleaned off disk when the comment goes.
- **Roles are rows, not an enum.** A role carries a permission map, so adding a
  permission is a checkbox rather than a migration. The old three-tier column is still
  written alongside it, which keeps older API clients working.
- **Rich text is stored as markdown, not HTML.** Nothing user-written is ever inserted
  as raw HTML — the renderer escapes first and builds the markup itself.
- **The list view is the board.** It reads the same lists and cards; changing a row's
  status moves the card between lists through the same endpoint dragging uses.

---

## Developing

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

Add `ports: ["5432:5432"]` to the `db` service while you are developing so the API can
reach Postgres from outside Docker.

[CONTRIBUTING.md](CONTRIBUTING.md) has the house style — the short version is: match the
surrounding code, never hard-code a colour, and check your change in all four colour
modes before you open a pull request.

---

## Not in the box

Being straight about the edges, so nobody is surprised:

- No email — notifications are in-app only, so there is no SMTP to configure
- No calendar or Gantt view; dates live on cards and in **My work**
- No time tracking, sprints or story points
- Card hierarchy is one parent per card, on the same board — not a cross-board tree
- No mobile apps — the web UI is responsive and works on a phone browser
- No SSO / LDAP; accounts are created by an administrator in the admin panel

---

## Licence

[MIT](LICENSE). Do what you like with it.
