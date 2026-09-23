# Support Supabase secret keys across privileged server requests

Opaque `sb_secret_*` keys now travel in `apikey` without the SDK's duplicate Bearer header. Database, storage, and direct Auth Admin calls use the new `SUPABASE_SECRET_KEY` setting; a missing or empty setting falls back to `SUPABASE_SERVICE_ROLE_KEY`. Legacy JWT keys retain their Bearer header.

The fetch adapter preserves Request headers and explicit user JWTs. Local setup uses the same header helper as the API, and configuration examples document the server-only key.

Validation:
- Unit regressions cover key precedence, empty settings, JWT compatibility, Request headers, and direct Auth Admin headers.
- `bun scripts/check-local-supabase-auth.ts` uses the running local Supabase stack's generated `sb_secret_*` key for database insert/read/update/delete, Auth Admin create/lookup/delete, and storage upload/download/cleanup. It also verifies legacy-key fallback and removes temporary resources.
