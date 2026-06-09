#!/usr/bin/env bash
# dev.sh — single-command dev launcher (macOS/Linux/Git Bash)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

if [[ "${1:-}" == "--no-refresher" ]]; then
  export F1ML_DISABLE_REFRESHER=1
  echo "→ Live refresher disabled"
fi

echo "→ Starting FastAPI on http://localhost:8000"
uvicorn src.api.main:app --reload --port 8000 &
API_PID=$!

echo "→ Starting Vite on http://localhost:5173"
(cd web && pnpm dev) &
WEB_PID=$!

cleanup() {
  echo ""
  echo "→ Stopping..."
  kill -TERM $API_PID $WEB_PID 2>/dev/null || true
  wait $API_PID $WEB_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
