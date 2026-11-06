#!/usr/bin/env bash
set -euo pipefail
# Run in record-tests.Dockerfile with artifacts mounted at /verification.
# The bundle is local; this never fetches from or pushes to a remote.
git clone -q /verification/record-stack.bundle /tmp/record-stack-verify
cd /tmp/record-stack-verify
ln -s /app/node_modules node_modules
git config user.email record-verification@example.test
git config user.name 'Local Record verification'
git branch record-base origin/record-base
previous=record-base
for branch in record/01-schema record/02-lifecycle record/03-storage record/04-processing record/05-sharing record/06-agent; do
  git checkout -q "$branch"
  name="${branch##*/}"
  report="/verification/coverage-$name"
  bun run test:coverage --maxWorkers=2 --coverage.reportsDirectory="$report" > "/verification/tests-$name.log" 2>&1
  DIFF_COVERAGE_FILE="$report/lcov.info" bun run test:diff-coverage -- "$previous" > "/verification/diff-$name.log" 2>&1
  printf '%s: tests and 100%% line/branch diff coverage passed\n' "$branch"
  previous="$branch"
done
