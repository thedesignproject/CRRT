# Support Supabase secret keys across privileged server requests

Opaque `sb_secret_*` keys now travel in `apikey` without the SDK's duplicate Bearer header. Database, storage, and direct Auth Admin calls use the new `SUPABASE_SECRET_KEY` setting; a missing or empty setting falls back to `SUPABASE_SERVICE_ROLE_KEY`. Legacy JWT keys retain their Bearer header.

The fetch adapter preserves Request headers and explicit user JWTs. Local setup uses the same header helper as the API, and configuration examples document the server-only key.

Vercel now bootstraps the pinned Bun 1.4.0 binary through `npx --yes` for install and build; the previous `bunx` bootstrap repeatedly exited before the dependency installer started. The frozen lockfile remains enforced.

Validation:
- Unit regressions cover key precedence, empty settings, JWT compatibility, Request headers, and direct Auth Admin headers.
- `bun scripts/check-local-supabase-auth.ts` uses the running local Supabase stack's generated `sb_secret_*` key for database insert/read/update/delete, Auth Admin create/lookup/delete, and storage upload/download/cleanup. It also verifies legacy-key fallback and removes temporary resources.
- Full suite: 1,680 tests passed; changed-line and changed-branch coverage are both 100%. Typecheck, SDK, landing-page, and dashboard builds passed. React 18 and React 19 CI passed.
