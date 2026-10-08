#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not available. Start Docker and run this script again." >&2
  exit 1
fi

echo "Building and starting rugby-world..."
docker compose up -d --build --remove-orphans

echo
docker compose ps
echo
echo "App: $(docker compose port rugby-world 3000)"
echo "Use 'docker compose logs -f rugby-world' to follow logs."
