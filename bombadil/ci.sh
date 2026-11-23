#!/usr/bin/env bash
# Runs Bombadil suites against a production build of the visual-test harness
# backed by the in-memory mock API. Used by the nightly and PR smoke workflows
# and runnable locally: ./ci.sh [time-limit-per-suite]   (default 10m)
# BOMBADIL_SUITES=widget-public,dashboard-populated limits it to those suites.
#
# Exit code: 0 when every suite is clean, 2 when any suite found a violation,
# 1 on other errors. Traces of failing suites are kept in out/failed/.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
LIMIT="${1:-10m}"
mkdir -p out out/failed
rm -f out/ci-*.txt out/ci-*.code out/failed/*.bin

echo "Building the harness with the mock API…"
(cd "$ROOT" && bunx vite build --config bombadil/harness.vite.config.ts) >/dev/null || { echo "build failed"; exit 1; }

PIDS=()
set +m # no job-control notices when the servers are stopped
serve() { # port fail-rate
  (cd "$ROOT" && PORT="$1" MOCK_FAIL_RATE="$2" MOCK_LOG="$ROOT/bombadil/out/mock-$1.log" \
    bunx vite preview --config bombadil/harness.vite.config.ts >"$ROOT/bombadil/out/server-$1.log" 2>&1) &
  PIDS+=($!)
}
cleanup() {
  { for pid in "${PIDS[@]}"; do pkill -P "$pid"; kill "$pid"; done; wait "${PIDS[@]}"; } 2>/dev/null
}
trap cleanup EXIT

: >out/mock-4390.log; : >out/mock-4391.log
serve 4390 0     # healthy API
serve 4391 0.3   # 30% of writes fail on purpose
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:4390/widget && curl -sf -o /dev/null http://127.0.0.1:4391/widget && break
  sleep 1
done

# name | command (each suite gets its own browser; public-mode suites get their
# own server so their comment state doesn't interfere)
SUITES=(
  "widget-idle|ORIGIN=http://127.0.0.1:4390 TAG=ci-idle ./run-widget.sh idle $LIMIT"
  "widget-send-error|ORIGIN=http://127.0.0.1:4390 TAG=ci-send-error ./run-widget.sh send-error $LIMIT"
  "widget-public|ORIGIN=http://127.0.0.1:4390 EXTRA='&public=1' TAG=ci-public ./run-widget.sh idle $LIMIT"
  "widget-public-failing-api|ORIGIN=http://127.0.0.1:4391 EXTRA='&public=1' TAG=ci-public-failing ./run-widget.sh idle $LIMIT"
  "dashboard-populated|ORIGIN=http://127.0.0.1:4390 ./run-dashboard.sh 1 $LIMIT"
  "dashboard-empty|ORIGIN=http://127.0.0.1:4390 ./run-dashboard.sh empty $LIMIT"
)

if [ -n "${BOMBADIL_SUITES:-}" ]; then
  SELECTED=()
  for suite in "${SUITES[@]}"; do
    case ",$BOMBADIL_SUITES," in *",${suite%%|*},"*) SELECTED+=("$suite") ;; esac
  done
  [ "${#SELECTED[@]}" -gt 0 ] || { echo "no suites match BOMBADIL_SUITES=$BOMBADIL_SUITES"; exit 1; }
  SUITES=("${SELECTED[@]}")
fi

RUNS=()
for suite in "${SUITES[@]}"; do
  name="${suite%%|*}"; cmd="${suite#*|}"
  (eval "$cmd" >"out/ci-$name.txt" 2>&1; echo $? >"out/ci-$name.code") &
  RUNS+=($!)
done
wait "${RUNS[@]}"

worst=0
echo
printf '%-28s %s\n' SUITE RESULT
for suite in "${SUITES[@]}"; do
  name="${suite%%|*}"; code="$(cat "out/ci-$name.code" 2>/dev/null || echo 1)"
  trace="$(grep -oE 'out/(widget|dashboard)-[A-Za-z0-9-]+-[0-9]{8}-[0-9]{6}\.bin' "out/ci-$name.txt" | tail -1)"
  case "$code" in
    0) result="clean" ;;
    2) result="VIOLATIONS"; [ -n "$trace" ] && mv "$trace" out/failed/ ;;
    *) result="ERROR (exit $code)" ;;
  esac
  printf '%-28s %s\n' "$name" "$result"
  if [ "$code" = 2 ]; then
    ./node_modules/.bin/bombadil trace "out/failed/$(basename "$trace")" --json 2>/dev/null \
      | jq -r '(.metadata.violations // [])[] | .name' | sort | uniq -c | sed 's/^/    /'
  fi
  if [ "$code" = 2 ] || { [ "$code" != 0 ] && [ "$worst" = 0 ]; }; then worst=$code; fi
done
grep -h 'not mocked' out/mock-4390.log out/mock-4391.log 2>/dev/null | awk '{print $2, $3}' | sort | uniq -c | sed 's/^/  unmocked: /' || true
exit "$worst"
