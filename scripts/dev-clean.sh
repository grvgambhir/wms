#!/bin/sh
# Frees everything `npm run dev` needs, then sweeps orphaned watchers.
#
# TWO PROBLEMS, ONE COMMAND
# -------------------------
# 1. PORTS. Expo is the reason this started: when 8081 is taken it ASKS whether to use 8082,
#    and under `concurrently` there is no terminal to answer, so it exits. A dev server left
#    running from two days ago takes the stack down with a confusing error.
#
# 2. ORPHANED WATCHERS. `tsx watch` and Metro survive their parent shell, so every abandoned
#    dev session leaves a file watcher running forever. They bind no port, so a port sweep
#    never finds them — this machine had 15 watchers still pointed at `Code_Life/wms_api`,
#    a directory that stopped existing when the repos moved into `wms/`. They cost memory
#    and file descriptors and are never coming back to life.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)

# `tsx watch` IGNORES SIGTERM — a plain `kill` left all 24 watchers running on this machine
# and the sweep reported success. Ask politely, then insist.
stop() {
  [ -n "$1" ] || return 0
  kill $1 2>/dev/null || true
  sleep 2
  # `kill -0` on an already-dead pid exits 1, and under `set -e` that would abort the whole
  # sweep the moment the FIRST process died on time — the successful case.
  survivors=$(for pid in $1; do kill -0 "$pid" 2>/dev/null && echo "$pid" || true; done)
  [ -n "$survivors" ] && kill -9 $survivors 2>/dev/null
  return 0
}

# The supervisor goes FIRST. `npm run dev` now restarts a child that dies (--restart-tries),
# so killing the ports while concurrently is still up just makes it spawn them again — the
# sweep and the supervisor fight, and the supervisor wins.
supervisor=$(pgrep -f "$ROOT/node_modules/.bin/concurrently" 2>/dev/null || true)
[ -n "$supervisor" ] && { echo "supervisor: stopping $supervisor"; stop "$(echo "$supervisor" | tr '\n' ' ')"; }

for port in 3050 5173 8081; do
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  [ -n "$pids" ] && { echo "port $port: stopping $pids"; stop "$pids"; }
done

# Watchers for these repos, wherever they were started from — including the pre-move paths,
# which is why this matches on the repo directory name and not on $ROOT.
orphans=$(pgrep -f "wms_(api|backend|participant|admin)/node_modules/.bin/(tsx|expo|vite)" 2>/dev/null || true)
if [ -n "$orphans" ]; then
  echo "watchers: killing $(echo "$orphans" | wc -l | tr -d ' ') process(es)"
  stop "$(echo "$orphans" | tr '\n' ' ')"
fi

exit 0
