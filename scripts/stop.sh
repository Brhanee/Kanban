#!/usr/bin/env bash
set -euo pipefail

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -i :8000 || true)"
elif command -v fuser >/dev/null 2>&1; then
  PIDS="$(fuser -k 8000/tcp 2>/dev/null || true)"
else
  PIDS=""
fi

if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill
fi
