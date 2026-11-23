#!/usr/bin/env bash
# Run Bombadil against the widget harness. Start the harness first:
#   bun run harness        (serves http://127.0.0.1:4380)
#
# Usage: ./run-widget.sh [state] [time-limit]
#   state       harness mode: idle (default), empty, send-error, load-error,
#               tracker-error, sending, guest, ...
#   time-limit  e.g. 2m (default), 10m, 1h
set -euo pipefail
cd "$(dirname "$0")"

STATE="${1:-idle}"
LIMIT="${2:-2m}"
ORIGIN="${ORIGIN:-http://127.0.0.1:4380}"
EXTRA="${EXTRA:-}"   # e.g. &public=1
TAG="${TAG:-$STATE}"
mkdir -p out
OUT="out/widget-${TAG}-$(date +%Y%m%d-%H%M%S).bin"

set +e
./node_modules/.bin/bombadil browser test \
  "${ORIGIN}/widget?state=${STATE}${EXTRA}" \
  widget.ts \
  --headless ${BOMBADIL_FLAGS:-} \
  --time-limit "$LIMIT" \
  --width 1280 --height 800 \
  --output-path "$OUT"
CODE=$?
set -e

echo
case $CODE in
  0) echo "No violations. Trace: $OUT" ;;
  2) echo "VIOLATIONS FOUND. Inspect with: ./node_modules/.bin/bombadil browser inspect $OUT" ;;
  *) echo "Bombadil error (exit $CODE). Trace (if any): $OUT" ;;
esac
exit $CODE
