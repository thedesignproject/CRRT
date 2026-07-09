# Security Rules

## Agent API Workflow

Source: `api/_lib/prompts.ts:54-83`; `apps/landing/public/skill.md:101-110`.

- Announce agent presence before reading state.
- Read share state before starting work.
- Work only on comments whose `reviewStatus` is `accepted`.
- Claim a comment before editing it.
- Report `comment.start`, `comment.complete`, or `comment.block` as work proceeds.
- Keep presence fresh whenever status changes.
- Never change `reviewStatus`; humans own review status and agents own implementation status.
- For `text_range` comments, treat `anchor.selectedText`, `anchor.prefix`, `anchor.suffix`, and `anchor.containerSelector` as the target context, not the pin coordinates alone.
- Refresh share state before starting the next item.
- If blocked, call `comment.block` with a short summary and the specific decision or access needed.

## Agent API Access

Source: `api/_lib/prompts.ts:54-58`, `api/_lib/prompts.ts:72-74`.

- Use the share token as `Authorization: Bearer <token>`, `X-Share-Token: <token>`, or `?token=<token>` when calling agent share endpoints.
- Include `X-Agent-Id` with a stable agent id when reporting presence or operations.
- If the API fails in a surprising way, report the failure with a short summary, raw request/response, and request IDs when available.

## Data Access

Source: `db/DRIZZLE-GUIDE.md:42`; `AGENTS.md:9`.

- Do not put `DATABASE_URL` behind a `VITE_` prefix; it must never reach the browser bundle.
- Keep runtime API queries on `@supabase/supabase-js`; Drizzle is for schema and migrations only.

