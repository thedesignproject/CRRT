# Legacy SQL

Hand-applied schema files from before Drizzle. **Do not run on existing environments** — production already has every change here applied.

Kept for:
- Audit trail of historical DDL
- Reference when reading old commits/PRs

Schema source of truth is now `db/schema.ts`. Migrations live in `db/migrations/`.

Storage bucket policies (not Drizzle-manageable) moved to `../policies/`.
