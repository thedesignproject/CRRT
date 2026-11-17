#!/usr/bin/env bash
# Run a CI job's main work under its time budget.
#
#   scripts/ci-budget.sh <budget-seconds> <label> -- command [args...]
#
# Fails the job when the command takes longer than its budget, or when setup
# took longer than SETUP_BUDGET seconds (default 30). Setup is measured from
# CI_JOB_START, which each job's first step records; it covers checkout,
# toolchains and installs, not GitHub's runner provisioning. The command
# always runs to completion first, so the log shows its own result and how far
# over budget it went. Waiting for a runner is GitHub's queue, not the job's
# work, so it is not budgeted here; the CI audit tracks it.
set -uo pipefail

budget=$1
label=$2
shift 3
setup_budget=${SETUP_BUDGET:-30}
start=$(date +%s.%N)
setup=""
if [ -n "${CI_JOB_START:-}" ]; then
  setup=$(awk -v a="$start" -v b="$CI_JOB_START" 'BEGIN { printf "%.0f", a - b }')
fi

"$@"
status=$?

elapsed=$(awk -v a="$(date +%s.%N)" -v b="$start" 'BEGIN { printf "%.1f", a - b }')
over() { awk -v x="$1" -v y="$2" 'BEGIN { exit !(x > y) }'; }
echo "Budget: $label ${elapsed}s of ${budget}s${setup:+; setup ${setup}s of ${setup_budget}s}"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "| $label | ${elapsed}s / ${budget}s | ${setup:-n/a}s / ${setup_budget}s |" >> "$GITHUB_STEP_SUMMARY"
fi
if [ "$status" -ne 0 ]; then exit "$status"; fi
failed=0
if over "$elapsed" "$budget"; then
  echo "::error title=Over budget::$label took ${elapsed}s; its budget is ${budget}s"
  failed=1
fi
if [ -n "$setup" ] && over "$setup" "$setup_budget"; then
  echo "::error title=Over budget::$label setup took ${setup}s; the setup budget is ${setup_budget}s"
  failed=1
fi
exit "$failed"
