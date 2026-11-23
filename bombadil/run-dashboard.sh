#!/usr/bin/env bash
# Run Bombadil against the dashboard in mock mode.
# Usage: ./run-dashboard.sh [mock-mode] [time-limit]   mock-mode: 1 (default), empty, onboarding
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-1}"; LIMIT="${2:-2m}"; ORIGIN="${ORIGIN:-http://127.0.0.1:4390}"
mkdir -p out
OUT="out/dashboard-${MODE}-$(date +%Y%m%d-%H%M%S).bin"
set +e
./node_modules/.bin/bombadil browser test "${ORIGIN}/dashboard/?mock=${MODE}" dashboard.ts \
  --headless ${BOMBADIL_FLAGS:-} --time-limit "$LIMIT" --width 1440 --height 900 \
  --allow-url "http://127.0.0.1/dashboard*" --output-path "$OUT"
CODE=$?
set -e
echo; case $CODE in 0) echo "No violations. Trace: $OUT";; 2) echo "VIOLATIONS FOUND. Trace: $OUT";; *) echo "Bombadil error (exit $CODE). Trace: $OUT";; esac
exit $CODE
