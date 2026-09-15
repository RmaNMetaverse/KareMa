#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Check Docker prerequisites
if ! command -v docker >/dev/null 2>&1; then
  echo "  [X] Docker is not installed or not in PATH." >&2
  exit 1
fi

echo "  Showing live logs. Press Ctrl+C to stop watching (KareMa keeps running)."
echo ""

docker compose logs -f --tail 100 "$@"
