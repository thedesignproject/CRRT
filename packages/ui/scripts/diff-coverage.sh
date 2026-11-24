#!/usr/bin/env bash
# Runs the repo's 100% diff coverage gate (scripts/check-diff-coverage.sh) on this
# package. Vitest writes lcov paths relative to packages/ui; the gate diffs from the
# repo root, so rewrite them to repo-relative first.
set -euo pipefail
cd "$(dirname "$0")/.."
sed 's#^SF:src/#SF:packages/ui/src/#' coverage/lcov.info > coverage/lcov.repo.info
cd ../..
DIFF_COVERAGE_FILE=packages/ui/coverage/lcov.repo.info scripts/check-diff-coverage.sh "$@"
