# Deploying KareMa next to an existing site

This guide puts KareMa at **`http://192.168.90.224/KareMa`** on an Ubuntu server that
already serves another application on the same address, and never touches that
application's data, ports, or configuration beyond a single `include` line.

Substitute your own IP or hostname throughout. If you want a different sub-path, see
[Changing the sub-path](#changing-the-sub-path) — it is one setting in two places.

---

## What you end up with

```
      browser
         |  http://192.168.90.224/...
         v
+----------------------------------------------+
|  nginx on the host  (port 80, already there) |
|                                              |
|   /            -->  your existing app        |  <- untouched
|   /KareMa/     -->  127.0.0.1:8090           |  <- one new location block
+----------------------------------------------+
                          |
                          v
        +----------------------------------------+
        |  Docker, listening only on 127.0.0.1   |
        |                                        |
        |   karema-web   nginx + the built UI    |
        |   karema-api   Node API + websockets   |
        |   karema-db    PostgreSQL 16           |
        |                                        |
        |   volumes: karema_db, karema_files     |
        +----------------------------------------+
```

### Why this cannot disturb the other application

| Risk | Why it does not apply |
| --- | --- |
| Port conflict | KareMa's only published port is bound to `127.0.0.1`, and you pick a free one. Nothing new listens on a public interface. |
| Database conflict | PostgreSQL runs inside the container on the Docker network and is never published to the host, so an existing Postgres or MySQL is untouched. |
| Static file collisions | Everything KareMa serves lives under `/KareMa/`. The `^~` modifier on the location stops any regex rule the other app has (`location ~* \.(js\|css)$` and friends) from stealing its assets. |
| Config damage | The other app's site file gains exactly one `include` line. Everything else KareMa needs lives in its own two files. |
| Firewall changes | None. Port 80 was already open; nothing new is exposed. |

---

## Before you start

On the server:

```bash
ip a | grep 192.168.90.224 && nginx -v && git --version
```

Pick a loopback port that is free. 8080 is a common default for other tools, so check:

```bash
ss -ltnp | grep -E ':(8080|8090)\b' || echo "both free"
```

This guide uses **8090** to stay clear of anything already on 8080. If 8090 is taken,
pick another and use it consistently below.

---

## Step 1 — Install Docker

Ubuntu ships an older, differently packaged `docker.io`. Use Docker's own repository so
you get Compose v2.

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
```

```bash
sudo install -m 0755 -d /etc/apt/keyrings && sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Let your user run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER && newgrp docker
```

```bash
docker compose version
```

That should print `v2.x`.

> Would rather not install Docker? See
> [Appendix A](#appendix-a--running-without-docker), which uses the Node and nginx
> already on the box.

---

## Step 2 — Get the code

```bash
sudo mkdir -p /opt && sudo chown "$USER":"$USER" /opt && git clone https://github.com/RmaNMetaverse/KareMa.git /opt/karema
```

---

## Step 3 — Configure

```bash
cd /opt/karema && cp .env.example .env && nano .env
```

Set these values; the rest can stay at their defaults.

```ini
# Loopback only — the host's nginx is the sole way in
KAREMA_BIND=127.0.0.1
KAREMA_PORT=8090

# Where KareMa lives in the URL. Keep both slashes.
BASE_PATH=/KareMa/

# Long random string. Changing it later signs everyone out.
JWT_SECRET=<paste the output of the command below>

# Your database password, and your first administrator account
POSTGRES_PASSWORD=<something of your own>
ADMIN_EMAIL=you@yourstudio.com
ADMIN_PASSWORD=<a real password>
ADMIN_NAME=Your Name
```

Generate the secret with:

```bash
openssl rand -base64 48
```

> **Single-quote any value containing a `$`.** In a `.env` file Docker Compose reads
> `$e` as a variable reference and substitutes it away, so `M0$e$2034` reaches the
> container as `M0$2034`. Written as `'M0$e$2034'` it arrives intact. This bites
> hardest on `POSTGRES_PASSWORD`, because the database volume gets initialised with
> the mangled value.

> `BASE_PATH` is compiled into the frontend bundle, so changing it later needs a
> rebuild (`docker compose up -d --build web`). It is not a runtime switch.

---

## Step 4 — First start

```bash
cd /opt/karema && ./karema.sh start
```

(If that reports `Permission denied`, run `chmod +x karema.sh` and try again.)

The first build takes a few minutes. When it finishes it prints
`http://localhost:8090/KareMa`. Confirm the stack is healthy:

```bash
curl -s http://127.0.0.1:8090/KareMa/api/health
```

Expected: `{"ok":true,"service":"karema","version":"1.0.0"}`

If that returns JSON, KareMa itself is working and only the nginx wiring is left.

---

## Step 5 — Wire it into the host's nginx

### 5a. Back up the current configuration

```bash
sudo cp -a /etc/nginx /etc/nginx.backup-$(date +%F)
```

### 5b. Add the websocket map

```bash
sudo cp /opt/karema/docs/nginx/karema-upgrade-map.conf /etc/nginx/conf.d/
```

`/etc/nginx/conf.d/*.conf` is already included from nginx's `http` block on Ubuntu, so
nothing else is needed. The variable is named `$karema_conn_upgrade` rather than the
conventional `$connection_upgrade` precisely so it cannot clash with a map the other
application may already define.

### 5c. Add the location block

```bash
sudo mkdir -p /etc/nginx/snippets && sudo cp /opt/karema/docs/nginx/karema-subpath.conf /etc/nginx/snippets/karema.conf
```

The shipped file points at port 8080. Make it match your `KAREMA_PORT`:

```bash
sudo sed -i 's|127.0.0.1:8080|127.0.0.1:8090|' /etc/nginx/snippets/karema.conf
```

### 5d. Include it from the existing site

nginx handles a request in two stages: a `server { }` block claims an address and port,
and the `location` blocks inside it match URL paths. Only one server block answers port
80 for a given address — the one already serving your other app — so KareMa's location
has to live inside *that* block, beside the other app's `location /`. The `include` line
pastes it there while keeping the rules in their own file.

Find the file holding that block. `nginx -T` prints every configuration file nginx
actually loaded, each preceded by its path:

```bash
sudo nginx -T 2>/dev/null | grep -E "^# configuration file|listen|server_name"
```

The file named just above a `listen 80` line is the one to edit. On a stock Ubuntu box
that is `/etc/nginx/sites-available/default`, but any name is possible.

> Do not go looking with `grep -r` in `/etc/nginx/sites-enabled/` — that directory holds
> symlinks, and `grep -r` skips symlinks it meets while recursing, so it finds nothing
> even when the site is right there. Use `nginx -T`, or `grep -R`.

Back the file up before touching it:

```bash
sudo cp /etc/nginx/sites-available/<that-file> /etc/nginx/sites-available/<that-file>.bak-$(date +%F)
```

Then add **one line** inside its `server { ... }` block. Position within the block does
not matter — nginx matches locations by specificity, not by order:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    include /etc/nginx/snippets/karema.conf;   # <- the only edit

    location / {
        # ... the existing application, untouched ...
    }
}
```

If `nginx -t` fails in the next step, nothing has been applied yet — restore the backup
you just made and check the error before reloading.

### 5e. Test and reload

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`reload` swaps the configuration without dropping a connection — the other application
keeps serving throughout. **If `nginx -t` reports an error, nothing has been applied
yet**; fix the file and test again before reloading.

---

## Step 6 — Verify

```bash
curl -s -o /dev/null -w '%{http_code}  %{url_effective}\n' http://192.168.90.224/KareMa/ http://192.168.90.224/KareMa/api/health http://192.168.90.224/
```

Expected: `200`, `200`, and whatever the other app returned before (`200`, `301` or `302`).

Then open **`http://192.168.90.224/KareMa/`** in a browser and sign in with the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

Worth clicking through once:

- open a board — cards, lists, drag-and-drop
- open a card and attach an image — it should render, not 404
- open the same board in two tabs and move a card — it moves in both (websocket)
- reload on a deep link like `/KareMa/b/<id>` — it should load, not 404
- confirm the other application still works at `/`

---

## Updating

### The normal case: you pushed a commit

On your machine:

```bash
git push
```

On the server:

```bash
cd /opt/karema && git pull && ./karema.sh update
```

`update` runs `docker compose up -d --build`. It rebuilds only what changed, keeps the
database and attachments, and waits for the API to answer before reporting success.
Expect 30–90 seconds; a frontend-only change is faster.

**`git pull` will not touch your `.env`** — it is gitignored, so your secrets, port and
`BASE_PATH` survive every update. Keep the server checkout clean (never edit files under
`/opt/karema` directly) so `git pull` always fast-forwards.

Nothing about nginx changes. The host proxies to a port, and the port does not move.

### Rebuilding only what you touched

`./karema.sh update` is always safe. When you want to be quicker:

| What changed | Command (from `/opt/karema`) |
| --- | --- |
| Anything, or you are not sure | `./karema.sh update` |
| `web/` only — UI, styles, components | `docker compose up -d --build web` |
| `server/` only — routes, logic | `docker compose up -d --build api` |
| `server/prisma/schema.prisma` | `docker compose up -d --build api` — the schema is pushed automatically on boot |
| A value in `.env` other than `BASE_PATH` | `docker compose up -d` — no rebuild needed |
| `BASE_PATH` in `.env` | `docker compose up -d --build web`, then update the nginx snippet and reload |
| `docs/nginx/*.conf` | copy into `/etc/nginx/...` again, then `sudo nginx -t && sudo systemctl reload nginx` |

### Schema changes

The API runs `prisma db push` every time it boots, so a migration is just part of the
rebuild. Because a schema change is the one update that can lose data, back up first:

```bash
cd /opt/karema && ./karema.sh backup && git pull && ./karema.sh update
```

### Checking an update landed

```bash
cd /opt/karema && git log -1 --oneline && docker compose ps
```

```bash
curl -s http://127.0.0.1:8090/KareMa/api/health
```

```bash
cd /opt/karema && ./karema.sh logs
```

(`Ctrl-C` stops following the logs.)

Browsers do not need a hard refresh — asset filenames are content-hashed, so a new build
is fetched automatically.

### Rolling back a bad update

```bash
cd /opt/karema && git log --oneline -10
```

```bash
cd /opt/karema && git checkout <the-previous-commit> && ./karema.sh update
```

To return to the tip afterwards:

```bash
cd /opt/karema && git checkout main && ./karema.sh update
```

If the *data* also needs to go back, restore the backup you took:

```bash
cd /opt/karema && ./karema.sh restore backups/2026-08-26_14-30
```

### One command, if you prefer

Save this as `/usr/local/bin/karema-deploy`:

```bash
sudo tee /usr/local/bin/karema-deploy > /dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -e
cd /opt/karema
./karema.sh backup
git pull
./karema.sh update
SCRIPT
```

```bash
sudo chmod +x /usr/local/bin/karema-deploy
```

After that, the entire server-side procedure following any push is:

```bash
karema-deploy
```

---

## Backups

```bash
cd /opt/karema && ./karema.sh backup
```

That writes `./backups/<date>_<time>/` containing a database dump and every attachment. To go
back:

```bash
cd /opt/karema && ./karema.sh restore backups/2026-08-26_14-30
```

A nightly copy at 03:00:

```bash
( crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/karema && ./karema.sh backup" ) | crontab -
```

Copy `/opt/karema/backups/` off the machine periodically — a backup on the same disk is
not a backup.

---

## Troubleshooting

**`/KareMa/` returns 404, and it is the other app's 404 page.**
The `include` line is missing, or it sits outside the `server { }` block. Check with:

```bash
sudo nginx -T | grep -A2 'location ^~ /KareMa/'
```

If that prints nothing, nginx is not loading the snippet.

**`/KareMa/` returns 502 Bad Gateway.**
The containers are not up, or the port in the snippet does not match `KAREMA_PORT`.

```bash
cd /opt/karema && docker compose ps && grep proxy_pass /etc/nginx/snippets/karema.conf
```

**The page loads but is blank, and the console shows 404s for `/assets/...`.**
The bundle was built for the root, not for `/KareMa/`. Confirm `BASE_PATH=/KareMa/` in
`.env` and rebuild the frontend:

```bash
cd /opt/karema && docker compose up -d --build web
```

**Boards do not update live between tabs.**
The websocket is not getting through. Confirm the map file is loaded — this should print
both the map and the `proxy_set_header Connection` line:

```bash
sudo nginx -T | grep karema_conn_upgrade
```

**Large attachments fail near the end of the upload.**
Raise `client_max_body_size` in `/etc/nginx/snippets/karema.conf` and `MAX_UPLOAD_MB` in
`.env`, then reload nginx and run `docker compose up -d`.

**You cannot sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.**
The first administrator is created only when the database is empty, so if you
started KareMa once before editing `.env`, the account was made from the old values
and later edits do nothing. Check what exists:

```bash
docker exec karema-db psql -U karema -d karema -c 'select email, name from "User";'
```

Either sign in with those credentials and change them in Settings, or — if there is
nothing to lose yet — wipe and start over:

```bash
cd /opt/karema && docker compose down -v && ./karema.sh start
```

`down -v` destroys the database and attachments. Also confirm no password in `.env`
contains an unquoted `$` (see Step 3).

**`nginx -t` fails with "duplicate map".**
Something else already defines the same variable. The shipped map uses
`$karema_conn_upgrade`; if you renamed it, rename it back.

**The browser shows the other app instead of KareMa.**
Check you are on `http://192.168.90.224/KareMa/` **with** the trailing slash. Without it
you should get a 301 to the slashed form; if you do not, the `location = /KareMa` block
is missing.

---

## Changing the sub-path

To serve at `/boards` instead:

```bash
cd /opt/karema && sed -i 's|^BASE_PATH=.*|BASE_PATH=/boards/|' .env && docker compose up -d --build web
```

```bash
sudo sed -i 's|/KareMa|/boards|g' /etc/nginx/snippets/karema.conf && sudo nginx -t && sudo systemctl reload nginx
```

To give KareMa its own hostname instead of a sub-path, set `BASE_PATH=/`, rebuild the web
image, and give it an ordinary `server` block of its own with
`server_name karema.example.com;` and `location / { proxy_pass http://127.0.0.1:8090; }`
plus the same proxy headers.

## Adding HTTPS later

Because everything already flows through the host's nginx, TLS is a property of that
server block and KareMa needs no changes:

```bash
sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d your.domain
```

`X-Forwarded-Proto` is already being passed, so the app sees the right scheme.

---

## Appendix A — running without Docker

The VM already has Node and nginx, so this works too. It is more to maintain — you own
the PostgreSQL install and a systemd unit — but it adds no new runtime.

### A1. PostgreSQL

```bash
sudo apt-get update && sudo apt-get install -y postgresql
```

```bash
sudo -u postgres psql -c "CREATE USER karema WITH PASSWORD 'pick-a-password';" && sudo -u postgres psql -c "CREATE DATABASE karema OWNER karema;"
```

### A2. Code and data directories

```bash
sudo mkdir -p /var/lib/karema/uploads /var/www/karema && sudo chown -R "$USER":"$USER" /var/lib/karema /var/www/karema
```

```bash
sudo mkdir -p /opt && sudo chown "$USER":"$USER" /opt && git clone https://github.com/RmaNMetaverse/KareMa.git /opt/karema
```

Node 22 is required (`node -v`). If Ubuntu's is older:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

### A3. Build the API

```bash
cd /opt/karema/server && npm install && npx prisma generate && npm run build
```

### A4. Build the frontend for the sub-path

```bash
cd /opt/karema/web && npm install && BASE_PATH=/KareMa/ npm run build
```

```bash
mkdir -p /var/www/karema/KareMa && cp -r /opt/karema/web/dist/. /var/www/karema/KareMa/
```

### A5. Run the API as a service

```bash
sudo tee /etc/systemd/system/karema.service > /dev/null <<'UNIT'
[Unit]
Description=KareMa API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/karema/server
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=UPLOAD_DIR=/var/lib/karema/uploads
Environment=MAX_UPLOAD_MB=100
Environment=DATABASE_URL=postgresql://karema:pick-a-password@127.0.0.1:5432/karema?schema=public
Environment=JWT_SECRET=replace-with-openssl-rand-base64-48
Environment=ADMIN_EMAIL=you@yourstudio.com
Environment=ADMIN_PASSWORD=change-me
Environment=ADMIN_NAME=Administrator
ExecStartPre=/usr/bin/npx prisma db push --skip-generate --accept-data-loss
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
```

Edit the `DATABASE_URL`, `JWT_SECRET` and admin values to match what you chose, then:

```bash
sudo chown -R www-data:www-data /var/lib/karema && sudo systemctl daemon-reload && sudo systemctl enable --now karema
```

```bash
sudo systemctl status karema --no-pager
```

The API listens on `127.0.0.1:4000` only.

### A6. nginx for this variant

Instead of `docs/nginx/karema-subpath.conf`, put this in
`/etc/nginx/snippets/karema.conf` — nginx serves the files itself and proxies only the
API and the websocket:

```nginx
location = /KareMa { return 301 /KareMa/; }

location ^~ /KareMa/api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 512M;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
}

location ^~ /KareMa/socket.io/ {
    proxy_pass http://127.0.0.1:4000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Host       $host;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $karema_conn_upgrade;
    proxy_read_timeout 3600s;
}

location ^~ /KareMa/assets/ {
    root /var/www/karema;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ^~ /KareMa/ {
    root /var/www/karema;
    try_files $uri $uri/ /KareMa/index.html;
}
```

The trailing slashes on those two `proxy_pass` lines are what strip `/KareMa` before the
request reaches the API — do not remove them. Steps 5a, 5b, 5d and 5e above still apply
unchanged.

### A7. Updating this variant

```bash
cd /opt/karema && git pull
```

```bash
cd /opt/karema/server && npm install && npm run build && sudo systemctl restart karema
```

```bash
cd /opt/karema/web && npm install && BASE_PATH=/KareMa/ npm run build && sudo rm -rf /var/www/karema/KareMa && sudo mkdir -p /var/www/karema/KareMa && sudo cp -r dist/. /var/www/karema/KareMa/
```

Back up before schema changes:

```bash
sudo -u postgres pg_dump karema > ~/karema-$(date +%F).sql && sudo tar czf ~/karema-uploads-$(date +%F).tar.gz -C /var/lib/karema uploads
```

---

## Appendix B — removing KareMa cleanly

```bash
sudo rm -f /etc/nginx/conf.d/karema-upgrade-map.conf /etc/nginx/snippets/karema.conf
```

Delete the `include /etc/nginx/snippets/karema.conf;` line from the site file, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
cd /opt/karema && ./karema.sh backup && ./karema.sh uninstall
```

`uninstall` removes the containers **and all data**, which is why the backup comes first.
The other application is unaffected at every step.
