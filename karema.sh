#!/usr/bin/env bash
# KareMa control script for macOS and Linux.
#
#   ./karema.sh start      build (if needed) and start KareMa
#   ./karema.sh stop       stop it, keeping all data
#   ./karema.sh restart    stop then start
#   ./karema.sh logs       follow the logs
#   ./karema.sh update     rebuild from the current source, keeping all data
#   ./karema.sh backup     write the database + attachments to ./backups/<date>
#   ./karema.sh restore    restore from a backup folder
#   ./karema.sh status     show what is running
#   ./karema.sh uninstall  remove the containers AND all data
set -euo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
say()  { printf '  %s\n' "$*"; }
ok()   { printf '  %s%s%s\n' "$GREEN" "$*" "$OFF"; }
warn() { printf '  %s%s%s\n' "$YELLOW" "$*" "$OFF"; }
die()  { printf '  %s%s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }

# ---------------------------------------------------------------- prerequisites
need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker Desktop (or 'sudo systemctl start docker') and try again."
  docker compose version >/dev/null 2>&1 || die "This needs Docker Compose v2 ('docker compose'). Update Docker."
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n'
  fi
}

ensure_env() {
  [ -f .env ] && return
  say "First run — creating your .env configuration..."
  cp .env.example .env
  local secret; secret=$(random_secret)
  # portable in-place edit (BSD sed on macOS needs the empty -i argument)
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${secret}|" .env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${secret}|" .env
  fi
  ok "Generated a unique JWT_SECRET for this installation."
  say ""
  say "Edit .env now if you want a different port or admin login. Defaults:"
  say "  address   http://localhost:8080"
  say "  email     admin@karema.local"
  say "  password  admin1234"
  say ""
}

port() {
  local p; p=$(grep -E '^KAREMA_PORT=' .env 2>/dev/null | cut -d= -f2 || true)
  printf '%s' "${p:-8080}"
}

# The sub-path KareMa is mounted under, with no trailing slash.
# "" for a normal install, "/KareMa" when BASE_PATH=/KareMa/ in .env.
base_path() {
  local b; b=$(grep -E '^BASE_PATH=' .env 2>/dev/null | cut -d= -f2 || true)
  b=${b:-/}
  b=${b%/}
  printf '%s' "${b#/}" | sed 's|^|/|; s|^/$||'
}

# Where to reach this instance from the machine it runs on.
local_url() {
  printf 'http://localhost:%s%s' "$(port)" "$(base_path)"
}

open_browser() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

wait_for_api() {
  local i
  say "Waiting for KareMa to come up..."
  for i in $(seq 1 40); do
    if curl -fsS "$(local_url)/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

# ---------------------------------------------------------------------- actions
cmd_start() {
  need_docker
  ensure_env
  say "Building and starting KareMa. The first run takes a few minutes."
  echo
  docker compose up -d --build
  echo
  local p url; p=$(port); url=$(local_url)
  if wait_for_api; then
    echo
    ok "KareMa is running."
    echo
    say "${BOLD}Open${OFF}      ${url}"
    say "${BOLD}Sign in${OFF}   with ADMIN_EMAIL / ADMIN_PASSWORD from .env"
    echo
    say "${DIM}On your network, others reach it at http://$(hostname):${p}$(base_path)${OFF}"
    say "${DIM}Behind a reverse proxy, use the address it publishes instead.${OFF}"
    echo
    open_browser "$url"
  else
    warn "It did not answer in time. Check './karema.sh logs'."
  fi
}

cmd_stop()    { need_docker; docker compose stop; ok "Stopped. Your data is safe — './karema.sh start' brings it back."; }
cmd_restart() { cmd_stop; cmd_start; }
cmd_logs()    { need_docker; docker compose logs -f --tail 100; }
cmd_status()  { need_docker; docker compose ps; }

cmd_update() {
  need_docker
  say "Rebuilding KareMa from the current source..."
  docker compose up -d --build
  if wait_for_api; then
    ok "Updated. The database and attachments were left untouched."
  else
    warn "Rebuilt, but the API did not answer in time. Check './karema.sh logs'."
  fi
}

cmd_backup() {
  need_docker
  local user db stamp dest
  user=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2); user=${user:-karema}
  db=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2);     db=${db:-karema}
  stamp=$(date +%Y-%m-%d_%H-%M)
  dest="backups/${stamp}"
  mkdir -p "$dest"

  say "Backing up to ${dest}"
  say "[1/2] database..."
  docker compose exec -T db pg_dump -U "$user" -d "$db" > "${dest}/database.sql"
  say "[2/2] attachments..."
  docker run --rm \
    -v karema_karema_files:/data \
    -v "$(pwd)/${dest}":/backup \
    alpine tar czf /backup/attachments.tar.gz -C /data .
  echo
  ok "Done. Keep the whole ${dest} folder somewhere safe."
  ls -la "$dest"
}

cmd_restore() {
  need_docker
  local src="${1:-}"
  [ -n "$src" ] || die "Usage: ./karema.sh restore backups/2026-01-31_09-15"
  [ -f "${src}/database.sql" ] || die "${src} does not contain database.sql"

  echo
  warn "This REPLACES the current KareMa data with the backup in ${src}"
  printf '  Type RESTORE to continue: '
  read -r confirm
  [ "$confirm" = "RESTORE" ] || { say "Cancelled."; exit 0; }

  local user db
  user=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2); user=${user:-karema}
  db=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2);     db=${db:-karema}

  say "Stopping the app..."
  docker compose stop api web
  say "Restoring the database..."
  docker compose exec -T db psql -U "$user" -d postgres -c "DROP DATABASE IF EXISTS ${db};" >/dev/null
  docker compose exec -T db psql -U "$user" -d postgres -c "CREATE DATABASE ${db};" >/dev/null
  docker compose exec -T db psql -U "$user" -d "$db" < "${src}/database.sql" >/dev/null

  if [ -f "${src}/attachments.tar.gz" ]; then
    say "Restoring attachments..."
    docker run --rm \
      -v karema_karema_files:/data \
      -v "$(pwd)/${src}":/backup \
      alpine sh -c 'rm -rf /data/* && tar xzf /backup/attachments.tar.gz -C /data'
  fi

  say "Starting the app..."
  docker compose start api web
  ok "Restore complete."
}

cmd_uninstall() {
  need_docker
  echo
  warn "This deletes the KareMa containers, the database AND every uploaded file."
  say  "Run './karema.sh backup' first if you want a copy."
  printf '  Type DELETE to continue: '
  read -r confirm
  [ "$confirm" = "DELETE" ] || { say "Cancelled."; exit 0; }
  docker compose down -v
  ok "Removed."
}

case "${1:-start}" in
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  logs)      cmd_logs ;;
  status)    cmd_status ;;
  update)    cmd_update ;;
  backup)    cmd_backup ;;
  restore)   cmd_restore "${2:-}" ;;
  uninstall) cmd_uninstall ;;
  *)
    echo "KareMa — usage: ./karema.sh {start|stop|restart|logs|status|update|backup|restore <dir>|uninstall}"
    exit 1
    ;;
esac
