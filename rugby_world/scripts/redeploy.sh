#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to redeploy: this checkout has uncommitted changes." >&2
  echo "Commit or discard them first, then rerun this script." >&2
  exit 1
fi

echo "Fetching the latest committed code..."
git pull --ff-only

exec "$PROJECT_DIR/scripts/deploy.sh"
