#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT/backend"

if ! command -v uv >/dev/null 2>&1; then
  python3 -m pip install --user uv
fi

uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
