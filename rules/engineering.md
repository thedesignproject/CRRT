# Engineering Rules

## Schema Changes

- Route every schema change through `db/schema.ts`; do not hand-write schema SQL as the source of truth.
- Before editing schema, read `db/DRIZZLE-GUIDE.md`.
- Generate migrations with `bun run db:generate`, then read the generated SQL before committing it.
- Commit `db/schema.ts`, the generated migration SQL, `db/migrations/meta/_journal.json`, and the new snapshot together.
- Treat applied migrations as immutable; do not edit or delete applied migration files.
- Keep migrations backwards-compatible; for renames, replace drop-and-add SQL with `ALTER TABLE ... RENAME COLUMN ...`.
- Do not run `db:push` against production or shared development databases.
- Keep `@supabase/supabase-js` as the runtime query layer; do not migrate `api/` query call sites to Drizzle's query builder.

## Legacy SQL

- Treat `supabase/legacy/` as a frozen historical record.
- Do not add new files under `supabase/legacy/`.
- Do not run legacy SQL files against any environment.

## Dashboard Routing

- The dashboard ships under `/dashboard/`; make in-app routes, links, and public assets base-aware.
- Use `route()` and `asset()` from `apps/dashboard/lib/routes.ts`.
- Do not hardcode absolute `/foo` paths in dashboard routes, links, or asset references.

## Diff Coverage

- After any code change, invoke the repo-local `$diff-coverage` skill before handing work back.
- Require 100% diff line coverage against the current PR base.
- Require 100% diff branch coverage against the current PR base.
- For stacked PRs, check each layer against the branch immediately below it so tests from higher layers cannot mask gaps in lower layers.
