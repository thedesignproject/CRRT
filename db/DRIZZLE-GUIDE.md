# Drizzle guide — schema changes, rules, gotchas

Read this before any schema edit. `README.md` covers the basic commands; this file covers the rules + edge cases that prevent breaking prod.

## Standard workflow

1. Edit `db/schema.ts`
2. `bun run db:generate` — drizzle diffs schema vs last snapshot, writes `db/migrations/000N_<name>.sql` + updates `db/migrations/meta/`
3. **Read the generated SQL.** Confirm it does what you intended (especially: no unintended drops)
4. Commit `schema.ts` + the new migration file + updated `meta/` together in one commit
5. Push → merge → Vercel prod build runs `db:migrate` automatically

## Auto-apply pipeline

```
git push (trunk)
  → Vercel triggers prod build
  → buildCommand = `bun run deploy-build`
  → bun run typecheck          (fail → abort, DB untouched)
  → vite build                 (fail → abort, DB untouched)
  → bun run db:migrate         (applies new migrations to prod DB)
  → deploy
```

`db:migrate` runs **last** so any code-level failure aborts before the DB mutates. Migrations are forward-only — a failed deploy after migrate has run does not roll back the schema. Each migration runs in a transaction, so no half-applied state within a single migration, but a successful migration followed by a failed deploy phase leaves prod code on the previous version against the new schema. Mitigation: keep migrations backwards-compatible (additive columns, nullable defaults) so old code still works against new schema.

## Rules — DO

- Edit `db/schema.ts` for any schema change. That file is the source of truth.
- Always commit `schema.ts` + generated SQL + `meta/_journal.json` + `meta/000N_snapshot.json` **together**. Splitting them breaks `drizzle-kit check` in CI.
- For column **renames**: generate a migration first, then hand-edit the SQL to use `ALTER TABLE … RENAME COLUMN …` instead of the auto-generated drop-then-add (which destroys data). Snapshot stays valid since column count + types unchanged.
- For destructive changes (drop column, drop table): review generated SQL twice. Decide if a data-preserving alternative exists.
- Treat applied migrations as immutable.
- **Keep migrations backwards-compatible.** Add columns nullable or with defaults; don't rename/drop a column in the same deploy that changes code reading it. Migrate runs late in the build but the schema can still mutate before the new code is live in a deploy-phase failure — old code must still work against the new schema. For renames/drops: ship a migration adding the new shape first, deploy code that uses both, then a follow-up migration that removes the old shape.

## Rules — DON'T

- ❌ Edit a migration SQL file after it's been applied to any environment. Drizzle stores its hash; later edits make CI's `drizzle-kit check` fail and risk drift between envs.
- ❌ Delete a migration file to "redo" it. Add a new migration that undoes/changes the schema instead.
- ❌ Run `db:push` against prod or shared dev. Push is for **your own local DB** during fast iteration before you're ready to materialize a migration. Bypasses migration history.
- ❌ Add hand-written SQL files to `supabase/legacy/`. That dir is frozen historical record.
- ❌ Put `DATABASE_URL` behind a `VITE_` prefix. Must never reach the browser bundle.
- ❌ Rewrite `api/` query call sites to use Drizzle's query builder. Supabase client stays for queries; Drizzle is migrations-only.

## Storage bucket policies

Supabase Storage policies (`supabase/policies/`) target the `storage.objects` table, which Drizzle does not manage. Apply by hand via the Supabase SQL editor when (re)creating a bucket on a new env.

## Connection string

Use **Direct connection** (port 5432) from Supabase dashboard → Project Settings → Database. Pooler mode breaks DDL + advisory locks.

## Extensions

`gen_random_uuid()` requires `pgcrypto`. Supabase enables it by default. If migrating to a non-Supabase Postgres, run `create extension if not exists pgcrypto;` first.

## Bootstrapping a brand-new environment

1. Create Supabase project. Note Direct connection URL (see "Connection string" above).
2. `DATABASE_URL=<new> bun run db:migrate` — runs `0000_baseline` + every subsequent migration to build full schema from scratch.
3. `DATABASE_URL=<new> bun run db:seed` — inserts demo project (optional).
4. Apply storage bucket policies from `supabase/policies/` via the Supabase SQL editor.

For pre-existing environments where the schema was created by hand from `supabase/legacy/schema.sql`, run `db:baseline` instead of `db:migrate` for the first migration only — it marks 0000 as applied without re-running its DDL.
