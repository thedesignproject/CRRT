## Read order for agents

These instructions apply to any coding agent working in this repo, including Claude Code, Codex, and Cursor.

- Any change -> read `rules/engineering.md`.
- UI or design changes -> read `rules/ux.md` and `branding/CRRT-DESIGN-SYSTEM.md`.
- Data, schema, or API changes -> read `rules/security.md` and `db/DRIZZLE-GUIDE.md`.
- Product or copy decisions -> read `rules/business.md`.

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

After any code change, MUST invoke the repo-local `$diff-coverage` skill from `.agents/skills/diff-coverage` before handing work back. Both line and branch diff coverage against the current PR's base are required at 100%. For stacked PRs, validate every layer against the branch immediately below it, not against `trunk`.

## Customer widget updates

When installing or updating CRRT in a customer project, check the installed npm version against the latest published release. Apply compatible updates within the authorized scope and run the project's relevant checks. For scheduled updates, follow the [widget update skill](apps/landing/public/widget-updates/SKILL.md): reuse existing automation, keep human review by default, and enable patch auto-merge only when explicitly requested. These instructions do not run a background schedule by themselves.
