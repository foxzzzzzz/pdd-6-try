#!/usr/bin/env bash
set -euo pipefail

WITH_SCHEDULER=0

for arg in "$@"; do
  case "$arg" in
    --with-scheduler) WITH_SCHEDULER=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f ".env" ]; then
  echo ".env not found. Run ./scripts/deploy-linux.sh first." >&2
  exit 1
fi

cleanup() {
  local pids
  pids="$(jobs -p)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

echo "Starting PDD Inspector on Linux..."
echo "Open http://localhost:3000 after the server is ready."

pnpm --filter @pdd-inspector/server run start &
pnpm --filter @pdd-inspector/worker run start &

if [ "$WITH_SCHEDULER" -eq 1 ]; then
  pnpm --filter @pdd-inspector/scheduler run start &
fi

wait
