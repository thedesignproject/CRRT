#!/usr/bin/env bash
# Runs Bombadil suites against a production build of the visual-test harness
# backed by the in-memory mock API (see README.md).
#
#   ./ci.sh [time-limit]                          every suite, 10m each by default
#   BOMBADIL_SUITES=widget-public ./ci.sh 2m      selected suites (comma-separated)
#
# Exit code: 0 when every suite is clean, 2 when any rule was violated, 1 on
# other errors. Traces are written to out/<suite>.bin; failing ones are moved
# to out/failed/.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
BOMBADIL=./node_modules/.bin/bombadil
LIMIT="${1:-10m}"
[[ "$LIMIT" =~ ^[0-9]+[smhd]$ ]] || { echo "invalid time limit '$LIMIT' (expected e.g. 30s, 10m, 2h)"; exit 1; }

ALL="widget-idle,widget-send-error,widget-public,widget-public-failing-api,dashboard-populated,dashboard-empty"
IFS=',' read -r -a SUITES <<< "${BOMBADIL_SUITES:-$ALL}"

# Sets URL, SPEC and EXTRA (bombadil flags) for a suite; fails for unknown names.
suite() {
  local widget="--width 1280 --height 800"
  local dashboard="--width 1440 --height 900 --allow-url http://127.0.0.1/dashboard*"
  case "$1" in
    widget-idle)               URL="http://127.0.0.1:4390/widget?state=idle";             SPEC=widget.ts;    EXTRA="$widget" ;;
    widget-send-error)         URL="http://127.0.0.1:4390/widget?state=send-error";       SPEC=widget.ts;    EXTRA="$widget" ;;
    widget-public)             URL="http://127.0.0.1:4390/widget?state=idle&public=1";    SPEC=widget.ts;    EXTRA="$widget" ;;
    widget-public-failing-api) URL="http://127.0.0.1:4391/widget?state=idle&public=1";    SPEC=widget.ts;    EXTRA="$widget" ;;
    dashboard-populated)       URL="http://127.0.0.1:4390/dashboard/?mock=1";             SPEC=dashboard.ts; EXTRA="$dashboard" ;;
    dashboard-empty)           URL="http://127.0.0.1:4390/dashboard/?mock=empty";         SPEC=dashboard.ts; EXTRA="$dashboard" ;;
    *) return 1 ;;
  esac
}
for name in "${SUITES[@]}"; do suite "$name" || { echo "unknown suite '$name' (known: $ALL)"; exit 1; }; done

mkdir -p out/failed
rm -f out/*.bin out/*.txt out/failed/*.bin

echo "Building the harness with the mock API…"
(cd "$ROOT" && bunx vite build --config bombadil/harness.vite.config.ts) >/dev/null || { echo "build failed"; exit 1; }

set +m # no job-control notices when the servers are stopped
SERVERS=()
serve() { # port fail-rate
  : >"out/mock-$1.log"
  (cd "$ROOT" && PORT="$1" MOCK_FAIL_RATE="$2" MOCK_LOG="$ROOT/bombadil/out/mock-$1.log" \
    bunx vite preview --config bombadil/harness.vite.config.ts >"$ROOT/bombadil/out/server-$1.log" 2>&1) &
  SERVERS+=($!)
}
trap '{ for pid in "${SERVERS[@]}"; do pkill -P "$pid"; kill "$pid"; done; wait "${SERVERS[@]}"; } 2>/dev/null' EXIT
serve 4390 0     # healthy API
serve 4391 0.3   # 30% of writes fail on purpose
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:4390/widget && curl -sf -o /dev/null http://127.0.0.1:4391/widget && break
  sleep 1
done

# One browser per suite, all in parallel.
RUNS=()
for name in "${SUITES[@]}"; do
  suite "$name"
  # EXTRA and BOMBADIL_FLAGS are intentionally split into separate flags.
  # shellcheck disable=SC2086
  "$BOMBADIL" browser test "$URL" "$SPEC" --headless ${BOMBADIL_FLAGS:-} $EXTRA \
    --time-limit "$LIMIT" --output-path "out/$name.bin" >"out/$name.txt" 2>&1 &
  RUNS+=($!)
done

worst=0
echo
printf '%-28s %s\n' SUITE RESULT
for i in "${!SUITES[@]}"; do
  name="${SUITES[$i]}"
  wait "${RUNS[$i]}"; code=$?
  case "$code" in
    0) printf '%-28s %s\n' "$name" clean ;;
    2) printf '%-28s %s\n' "$name" VIOLATIONS
       mv "out/$name.bin" out/failed/
       "$BOMBADIL" trace "out/failed/$name.bin" --json 2>/dev/null \
         | jq -r '(.metadata.violations // [])[] | .name' | sort | uniq -c | sed 's/^/    /' ;;
    *) printf '%-28s %s\n' "$name" "ERROR (exit $code, see out/$name.txt)" ;;
  esac
  if [ "$code" = 2 ] || { [ "$code" != 0 ] && [ "$worst" = 0 ]; }; then worst=$code; fi
done
grep -h 'not mocked' out/mock-4390.log out/mock-4391.log 2>/dev/null | awk '{print $2, $3}' | sort | uniq -c | sed 's/^/  unmocked: /' || true
exit "$worst"
