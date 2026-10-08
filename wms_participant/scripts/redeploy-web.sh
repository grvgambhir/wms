#!/usr/bin/env bash
# Rebuild Expo Web Docker image and restart nginx on PORT.
#   ./scripts/redeploy-web.sh          # VM: stash-if-dirty, pull, build, run
#   ./scripts/redeploy-web.sh --local  # laptop: build + run only (no git)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCAL=0
if [[ "${1:-}" == "--local" ]]; then
  LOCAL=1
fi

IMAGE="${IMAGE:-imga-athlete-poc:web}"
CONTAINER="${CONTAINER:-imga-web}"
PORT="${PORT:-6041}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "Repo: $ROOT branch: $BRANCH port: $PORT mode: $([[ "$LOCAL" -eq 1 ]] && echo local || echo vm)"

if [[ "$LOCAL" -eq 0 ]]; then
  # Stash only when the working tree is dirty (edited / extra files on the VM).
  if [[ -n "$(git status --porcelain)" ]]; then
    STASH_MSG="vm-before-pull $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Dirty tree — git stash push -u ($STASH_MSG)"
    git stash push -u -m "$STASH_MSG"
    echo "Stash kept (not popped). List: git stash list | restore: git stash pop"
  else
    echo "Clean tree — stash skip"
  fi

  echo "Pull $REMOTE/$BRANCH"
  git fetch "$REMOTE"
  git pull --ff-only "$REMOTE" "$BRANCH"
else
  echo "Local — skip git stash/pull; building working tree as-is"
fi

echo "Docker build $IMAGE"
docker build -t "$IMAGE" .

echo "Restart $CONTAINER :$PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped -p "${PORT}:80" "$IMAGE"

echo "Up: http://127.0.0.1:$PORT  (landing; Athlete Portal → /login)  check: curl -I http://127.0.0.1:$PORT"
