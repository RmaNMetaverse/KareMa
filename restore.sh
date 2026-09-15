#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo ""
  echo "  Usage: ./restore.sh <backup-folder>"
  echo "  Example:"
  echo "      ./restore.sh backups/2026-09-15_12-00"
  echo ""
  exit 1
fi

SRC="$1"

# Resolve backup directory path (supports relative and absolute paths)
if [ -d "$SRC" ]; then
  SRC_ABS="$(cd "$SRC" && pwd)"
elif [ -d "$(dirname "$0")/$SRC" ]; then
  SRC_ABS="$(cd "$(dirname "$0")/$SRC" && pwd)"
else
  echo "  [X] Backup directory not found: ${SRC}" >&2
  exit 1
fi

if [ ! -f "${SRC_ABS}/database.sql" ]; then
  echo "  [X] ${SRC_ABS} does not contain database.sql" >&2
  exit 1
fi

echo ""
echo "  This REPLACES the current KareMa data with the backup in:"
echo "      ${SRC_ABS}"
echo ""
read -r -p "  Type RESTORE to continue: " CONFIRM
case "$CONFIRM" in
  [rR][eE][sS][tT][oO][rR][eE]) ;;
  *)
    echo "  Cancelled."
    exit 0
    ;;
esac

# Check Docker prerequisites
if ! command -v docker >/dev/null 2>&1; then
  echo "  [X] Docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "  [X] Docker daemon is not running. Start Docker and try again." >&2
  exit 1
fi

# Read database credentials from .env if present
PGUSER=$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2 || true)
PGDB=$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2 || true)
PGUSER=${PGUSER:-karema}
PGDB=${PGDB:-karema}

echo "  Stopping the app..."
docker compose stop api web

echo "  Restoring the database..."
docker compose exec -T db psql -U "${PGUSER}" -d postgres -c "DROP DATABASE IF EXISTS ${PGDB};" >/dev/null
docker compose exec -T db psql -U "${PGUSER}" -d postgres -c "CREATE DATABASE ${PGDB};" >/dev/null
docker compose exec -T db psql -U "${PGUSER}" -d "${PGDB}" < "${SRC_ABS}/database.sql" >/dev/null

if [ -f "${SRC_ABS}/attachments.tar.gz" ]; then
  echo "  Restoring attachments..."
  docker run --rm -v karema_karema_files:/data -v "${SRC_ABS}":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/attachments.tar.gz -C /data"
fi

echo "  Starting the app..."
docker compose start api web

echo ""
echo "  Restore complete."
echo ""
