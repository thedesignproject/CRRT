# Repo notes for AI agents

## Database changes

**ALL schema changes go through `db/schema.ts`.** Do not write hand-rolled SQL files. Do not edit existing migration files in `db/migrations/`.

Read **`db/DRIZZLE-GUIDE.md`** before any schema change — it has the full rules, gotchas, and the rename-without-data-loss recipe. Quick command reference lives in `db/README.md`.

Supabase client (`@supabase/supabase-js`) stays the runtime query layer. Do **not** migrate `api/` query call sites to Drizzle's query builder.

## Legacy schema files

`supabase/legacy/` is frozen historical record from before Drizzle. Do not add new files there. Do not run those SQLs against any environment.

## Dashboard routing

The dashboard ships under a base path (`/dashboard/`), so all in-app routes/links and public assets must be base-aware — use `route()`/`asset()` from `apps/dashboard/lib/routes.ts`, never hardcode absolute `/foo` paths.

## Diff coverage

After any code change, MUST invoke `diff-coverage` skill before handing work back. Both line and branch diff coverage vs `trunk` required at 100%.
