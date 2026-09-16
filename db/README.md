# Database — Drizzle ORM

Schema source of truth: `schema.ts`. Drizzle owns DDL only — runtime queries still use `@supabase/supabase-js` via `api/_lib/supabase.ts`.

## Workflow

| Need | Command |
|---|---|
| Sync schema edits to dev DB (no migration file) | `bun run db:push` |
| Generate a versioned migration from schema diff | `bun run db:generate` |
| Apply pending migrations (used by `deploy-build`) | `bun run db:migrate` |
| Open the Drizzle Studio GUI | `bun run db:studio` |
| Re-seed demo project | `bun run db:seed` |
| Mark 0000_baseline as already-applied on a pre-existing DB (one-off per env) | `bun run db:baseline` |

## Environments

`DATABASE_URL` per env points at the right Postgres:

- **Local + Preview** → shared dev Supabase project
- **Production** → dedicated prod Supabase project

Vercel build runs `db:migrate` against whichever URL the env exposes — prod migrations apply only on prod deploys.

---

For detailed rules, gotchas, connection-string format, extensions, and bootstrapping a new env, see [DRIZZLE-GUIDE.md](./DRIZZLE-GUIDE.md).
