# Repo notes for AI agents

## Database changes

**ALL schema changes go through `db/schema.ts`.** Do not write hand-rolled SQL files. Do not edit existing migration files in `db/migrations/`.

Read **`db/DRIZZLE-GUIDE.md`** before any schema change — it has the full rules, gotchas, and the rename-without-data-loss recipe. Quick command reference lives in `db/README.md`.

Supabase client (`@supabase/supabase-js`) stays the runtime query layer. Do **not** migrate `api/` query call sites to Drizzle's query builder.

## Legacy schema files

`supabase/legacy/` is frozen historical record from before Drizzle. Do not add new files there. Do not run those SQLs against any environment.

## Diff coverage

**After every code change on a branch, diff coverage vs `trunk` must be 100%.** Add or extend tests until every changed/added line is covered before handing the work back.

Workflow:

1. `bun run test:coverage` — runs vitest with v8 coverage, writes `coverage/lcov.info` (configured in `vitest.config.ts`).
2. `/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=trunk` — reports % of changed lines covered, plus the exact missing line numbers per file.
   - `diff-cover` is installed in a local venv at `/tmp/dc-venv` (Python `diff-cover` package). If the venv is gone, recreate: `python3 -m venv /tmp/dc-venv && /tmp/dc-venv/bin/pip install diff-cover`.
3. For each file listed under `Missing lines`, read those lines, add a test that exercises them, re-run both commands. Repeat until output reads `Coverage: 100%`.

Notes:

- Coverage scope is set in `vitest.config.ts` (`include: src/**/*.{ts,tsx}`, `api/**/*.ts`). Files outside that scope don't count, even if changed.
- Heavy browser-only deps (e.g. `html2canvas`) should be mocked with `vi.mock(...)` rather than skipped — see `src/__tests__/screenshotCapture.test.ts` for the pattern.

### Branch coverage on diff (optional, opt-in)

`diff-cover` only checks line coverage; lcov marks a line "hit" if executed once, even when only one arm of a branch ran. Codecov reads `BRDA:` records from the same lcov and flags partial branches — so a PR can be 100% diff-line-covered locally and still fail Codecov on branch coverage.

To reproduce Codecov's branch view locally on changed lines vs a base branch:

```
bun run test:coverage
python3 scripts/diff-branch-cov.py trunk    # or staging, etc.
```

Output lists each changed line with a partial branch (e.g. `L16: 1/2 taken`) or fully-untaken branch. Exits non-zero if any are found.

**Do not run this on every change.** Only run when:

- the user asks for it explicitly, or
- a major chunk of work is done and you want to confirm Codecov will pass — in that case, ask the user first ("want me to run the branch-coverage check before you push?") instead of running it unprompted.

Line-coverage 100% is still the hard requirement from the section above; branch coverage is a stricter gate that's only worth paying for at milestones.
