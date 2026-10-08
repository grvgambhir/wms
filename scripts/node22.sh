#!/bin/sh
# Runs a command inside wms_backend under Node 22+.
#
# WHY THIS EXISTS
# ---------------
# argon2 has no Node 20 prebuild for darwin-arm64 and SEGFAULTS on require — exit code 139,
# no stack, no message. So `wms_backend` declares `engines: node >= 22`, ships an .npmrc with
# engine-strict=true, and refuses to boot below 22 in main.ts. All three are correct.
#
# The problem is the shell: this machine's default `node` is 20 (homebrew node@20 wins the
# PATH), so `npm run dev` from the repo root fails before the server starts, and the failure
# looks like an npm engine error rather than "your shell is on the wrong Node". Rather than
# asking every developer to remember an nvm switch, find a 22 and put it first on PATH.
#
# Usage:  ./scripts/node22.sh npm run dev
set -e
cd "$(dirname "$0")/../wms_backend"

NODE_BIN=""
for candidate in \
  node \
  /opt/homebrew/opt/node@22/bin/node \
  /opt/homebrew/opt/node/bin/node \
  /usr/local/bin/node \
  "$HOME"/.nvm/versions/node/v2[2-9]*/bin/node
do
  command -v "$candidate" >/dev/null 2>&1 || continue
  major=$("$candidate" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
  case "$major" in ''|*[!0-9]*) continue ;; esac
  [ "$major" -ge 22 ] && { NODE_BIN="$candidate"; break; }
done

if [ -z "$NODE_BIN" ]; then
  echo "wms_backend needs Node 22+ and none was found." >&2
  echo "Install one, e.g.  brew install node@22   (or  nvm install 22)." >&2
  exit 1
fi

# npm and tsx must inherit the same Node. Running the server on 22 while npm still resolves
# 20 brings the engine-strict failure straight back.
PATH="$(cd "$(dirname "$(command -v "$NODE_BIN")")" && pwd):$PATH"
export PATH

exec "$@"
