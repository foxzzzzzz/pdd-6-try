#!/usr/bin/env bash
set -euo pipefail

SKIP_REDIS=0
SKIP_SEED=0

for arg in "$@"; do
  case "$arg" in
    --skip-redis) SKIP_REDIS=1 ;;
    --skip-seed) SKIP_SEED=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

require_command() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "$name is required. $hint" >&2
    exit 1
  fi
}

run_step() {
  local title="$1"
  shift
  printf "\n==> %s\n" "$title"
  "$@"
}

echo "PDD Inspector macOS deploy"
echo "Workspace: $ROOT"

require_command node "Install Node.js 20+ from https://nodejs.org/ or Homebrew."
require_command pnpm "Install pnpm with: corepack enable"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required. Current major version: $NODE_MAJOR" >&2
  exit 1
fi

if [ ! -d "/Applications/Google Chrome.app" ]; then
  echo "Warning: Google Chrome was not found in /Applications. Install Chrome before running inspections." >&2
fi

if [ ! -f ".env" ]; then
  run_step "Create .env from .env.example" cp .env.example .env
else
  echo ".env already exists, skip copying."
fi

if [ "$SKIP_REDIS" -eq 0 ]; then
  if command -v docker >/dev/null 2>&1; then
    run_step "Start Redis with Docker Compose" docker compose up -d redis
  else
    echo "Warning: Docker is not installed. Make sure Redis is running and .env points to it." >&2
  fi
fi

run_step "Install dependencies" pnpm install
run_step "Run database migrations" pnpm db:migrate

if [ "$SKIP_SEED" -eq 0 ]; then
  run_step "Seed default data" pnpm db:seed
fi

run_step "Build all packages" pnpm build

printf "\nDeploy finished.\n"
echo "Start server and worker: ./scripts/start-macos.sh"
echo "Open: http://localhost:3000"
