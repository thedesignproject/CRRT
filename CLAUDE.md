# Repo notes for AI agents

## Database changes

**ALL schema changes go through `db/schema.ts`.** Do not write hand-rolled SQL files. Do not edit existing migration files in `db/migrations/`.

Read **`db/DRIZZLE-GUIDE.md`** before any schema change — it has the full rules, gotchas, and the rename-without-data-loss recipe. Quick command reference lives in `db/README.md`.

Supabase client (`@supabase/supabase-js`) stays the runtime query layer. Do **not** migrate `api/` query call sites to Drizzle's query builder.

## Legacy schema files

`supabase/legacy/` is frozen historical record from before Drizzle. Do not add new files there. Do not run those SQLs against any environment.

## Diff coverage

After any code change, MUST invoke `diff-coverage` skill before handing work back. Both line and branch diff coverage vs `trunk` required at 100%.

## Repo identity

This local folder is `feedback-widget`, but `origin` points at `github.com/thedesignproject/CRRT`. **They are the same repo.** The `tomasTDP/branding-widget` remote (alias `branding`) is **deprecated** — never push or reference it.

## Deploying to Vercel

Only commits whose author is `alsoalter85` (Alessandro) trigger Vercel builds — direct contributor permission for other users costs extra. Alessandro maintains a standing "kick Vercel" PR (originally **#113**, branch prefix `attaccante/vercel-deployment-trigger-*`) and a systemd timer that adds an empty commit as him every 15 min whenever the latest commit on that branch is not his.

**After merging a feature PR into `trunk`, to deploy:**
1. Open the standing "Trigger Vercel" PR and rebase/update it onto `trunk`.
2. Wait ≤15 min for Alessandro's automation to push a fresh empty commit.
3. Approve and merge that PR — Vercel deploys.

**Never close PR #113** (or its current successor). It is the standing PR the automation depends on.
