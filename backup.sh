#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Check Docker prerequisites
if ! command -v docker >/dev/null 2>&1; then
  echo "  [X] Docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "  [X] Docker daemon is not running. Start Docker (e.g. 'sudo systemctl start docker') and try again." >&2
  exit 1
fi

# Read database credentials from .env if present
PGUSER=$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2 || true)
PGDB=$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2 || true)
PGUSER=${PGUSER:-karema}
PGDB=${PGDB:-karema}

STAMP=$(date +%Y-%m-%d_%H-%M)
DEST="backups/${STAMP}"
mkdir -p "${DEST}"
DEST_ABS="$(cd "${DEST}" && pwd)"

echo ""
echo "  Backing up to ${DEST}"
echo ""

echo "  [1/2] database..."
if ! docker compose exec -T db pg_dump -U "${PGUSER}" -d "${PGDB}" > "${DEST}/database.sql"; then
  echo "  [X] Database backup failed. Is KareMa running? Start it first." >&2
  exit 1
fi

echo "  [2/2] attachments..."
if ! docker run --rm -v karema_karema_files:/data -v "${DEST_ABS}":/backup alpine tar czf /backup/attachments.tar.gz -C /data .; then
  echo "  [X] Attachment backup failed." >&2
  exit 1
fi

echo ""
echo "  Done. Keep the whole ${DEST} folder somewhere safe."
echo ""
ls -la "${DEST}"
echo ""
