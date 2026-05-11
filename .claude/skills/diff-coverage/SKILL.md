---
name: diff-coverage
description: Verify 100% diff line AND branch coverage vs trunk after code changes. Runs vitest coverage, then diff-cover (line) + diff-branch-cov.py (branch). Both required. Use after any src/**/*.{ts,tsx} or api/**/*.ts edit before handing work back.
---

# Diff coverage workflow

**Hard rule:** after every code change on a branch, both line-diff and branch-diff coverage vs `trunk` must be 100%. Add or extend tests until clean before handing work back.

## Steps

1. `bun run test:coverage` — runs vitest with v8 coverage, writes `coverage/lcov.info` (configured in `vitest.config.ts`).
2. `/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=trunk` — % changed lines covered + missing line numbers per file.
   - `diff-cover` lives in local venv at `/tmp/dc-venv`. If gone, recreate: `python3 -m venv /tmp/dc-venv && /tmp/dc-venv/bin/pip install diff-cover`.
3. `python3 scripts/diff-branch-cov.py trunk` — partial/untaken branches on changed lines (e.g. `L16: 1/2 taken`). Exits non-zero if any found. Reproduces Codecov's branch view locally; lcov marks a line "hit" even if only one branch arm ran, so this catches what `diff-cover` misses.
4. For each file under `Missing lines` (step 2) or partial branches (step 3): read those lines, add a test exercising them, re-run all three commands. Repeat until step 2 reads `Coverage: 100%` AND step 3 exits 0.

## Notes

- Coverage scope set in `vitest.config.ts` (`include: src/**/*.{ts,tsx}`, `api/**/*.ts`). Files outside scope don't count even if changed.
- Heavy browser-only deps (e.g. `html2canvas`) should be mocked with `vi.mock(...)` not skipped — see `src/__tests__/screenshotCapture.test.ts` for the pattern.
- Step 3 base branch is configurable (`trunk`, `staging`, etc.) — match whatever the PR will target.
