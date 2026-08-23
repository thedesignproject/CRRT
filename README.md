# CRRT 🥕

[![codecov](https://codecov.io/gh/thedesignproject/CRRT/branch/trunk/graph/badge.svg)](https://codecov.io/gh/thedesignproject/CRRT/tree/trunk)

CRRT 🥕 is visual feedback capture for React sites, plus a private reviewer console and a Proof-style agent bridge.

## What changed

This repo is no longer just "a widget that stores comments."

It now has three product surfaces:

- **Public widget** in `src/`
  - capture feedback on any page
  - submit comments to the public ingestion API
- **Reviewer dashboard** in `apps/dashboard/`
  - triage comments
  - accept or reject feedback
  - create agent shares
  - copy prompts for Codex or Claude Code
- **Public landing/demo** in `apps/landing/`
  - CRRT marketing page
  - live widget demo mounted against the same published widget source
- **Agent bridge API** in `api/v1/`
  - expose page-scoped or selection-scoped feedback to coding agents
  - track presence, events, and implementation updates

The old `/api/comments` route still exists as a compatibility path and for the smoke workflow. The new product flow uses `/api/v1/...`.

## Repo layout

- `src/`
  - published widget package
- `apps/dashboard/`
  - private reviewer UI
- `apps/landing/`
  - public CRRT landing/demo site for the widget
- `api/`
  - Vercel serverless API routes
- `db/`
  - Drizzle schema, migrations, seed
- `supabase/`
  - legacy SQL (`supabase/legacy/`) and storage policies (`supabase/policies/`) — schema management has moved to `db/`

## Public widget

Install:

```bash
bun add @thedesignproject/crrt
```

Usage:

```tsx
import { FeedbackWidget } from '@thedesignproject/crrt'

export default function App() {
  return (
    <FeedbackWidget projectId="demo-project" />
  )
}
```

Props:

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | `string` | yes | Project public key used for comment capture. |
| `apiBase` | `string` | no | Base URL of the backend that serves the widget API. Defaults to `https://crrt.ai/api`. Override to point at a self-hosted deployment. |
| `theme` | `'light' \| 'dark' \| 'system'` | no | Widget appearance. Defaults to `dark`; `system` follows `prefers-color-scheme`. |
| `disabled` | `boolean` | no | When `true`, the widget renders nothing — no UI, no listeners, no API calls. Defaults to `false`. Useful for turning the widget off per environment (e.g. production). |

## API surfaces

### Public comments

The current widget calls these HTTP endpoints at `apiBase`:

- `GET /v1/public/comments?projectKey=...` returns page comments for compatibility with the in-page sidebar.
- `POST /v1/public/comments` creates a public comment.
- `PATCH /v1/public/comments` updates review status for current widget compatibility.

Create comment request:

```json
{
  "projectKey": "demo-project",
  "pageUrl": "https://example.com/pricing",
  "selector": "main > section:nth-of-type(2) button",
  "x": 540,
  "y": 220,
  "body": "This CTA feels too weak"
}
```

Patch status request:

```json
{
  "id": "comment-id",
  "reviewStatus": "accepted"
}
```

### Reviewer API

Protected by `REVIEWER_API_TOKEN`.

```text
GET   /api/v1/projects
GET   /api/v1/projects/:projectId/comments
PATCH /api/v1/comments/:commentId/review-status
POST  /api/v1/feedback-shares
GET   /api/v1/feedback-shares/:shareId/prompt
```

### Agent bridge

Protected by per-share bearer token.

```text
GET  /api/v1/agent/shares/:slug/state
GET  /api/v1/agent/shares/:slug/events
POST /api/v1/agent/shares/:slug/presence
POST /api/v1/agent/shares/:slug/ops
```

## Database schema

Schema is managed with [Drizzle ORM](https://orm.drizzle.team). The source of truth is `db/schema.ts`, which defines:

- `projects`
- `project_repo_configs`
- `comments`
- `feedback_shares`
- `feedback_share_items`
- `feedback_events`
- `agent_presence`
- `feedback_operation_keys`

### Applying the schema

- **Development:** `bun db:push` — syncs the schema directly to your database. Fast iteration, skips migration history.
- **Production:** `bun db:migrate` — applies versioned migrations from `db/migrations/`. `deploy-build` runs this on every deploy.

### Generating a new migration

```bash
bun db:generate    # writes a new migration file under db/migrations/
bun db:migrate     # applies it
```

`bun db:seed` runs `db/seed.ts`, which inserts a `demo-project` row and a matching repo config for local development.

> The hand-managed SQL files used before Drizzle live under `supabase/legacy/` for reference only — do not run them against a current database.

## Environment variables

Example values live in `.env.example`.

Required server variables:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `REVIEWER_API_TOKEN`
- `SHARE_TOKEN_SECRET`

Optional server variables:

- `APP_URL` - canonical app URL for generated links and notification emails
- `RESEND_API_KEY` - enables comment activity emails through Resend
- `COMMENT_ACTIVITY_EMAIL_FROM` - sender for comment activity emails, defaults to `CRRT <activity@mail.crrt.ai>`
- `COMMENT_ACTIVITY_EMAIL_COOLDOWN_HOURS` - per-project email cooldown window, defaults to `5`
- `COMMENT_ACTIVITY_EMAIL_TIMEOUT_MS` - Resend request timeout, defaults to `5000`

Comment activity emails also require `SUPABASE_SERVICE_ROLE_KEY` so the API can resolve project member emails from Supabase Auth. Without it, the email path stays disabled because there are no resolved recipients.

Useful client variables:

- `VITE_API_BASE`
- `VITE_PROJECT_ID`
- `VITE_REVIEWER_TOKEN`

## Requirements

- React 18 or 19 on the consuming app.
- A backend implementing the endpoints above.

## Development

Install:

```bash
bun install
```

Run the public demo:

```bash
bun run dev
```

Run the reviewer dashboard:

```bash
bun run dev:dashboard
```

### Fully local development with Docker

Docker Desktop and the Supabase CLI can run Postgres, Auth, Storage, Realtime,
Studio, and local email without using a shared cloud project.

```bash
bun install
bun run local:up
bun run local:dev
```

`local:up` starts the containers, writes the local service credentials to the
ignored `.env.docker.local`, applies every Drizzle migration, seeds `demo-project`,
creates the public `feedback-images` bucket, and runs service smoke checks.

- Dashboard: `http://127.0.0.1:5173/dashboard/`
- API: `http://127.0.0.1:3001`
- Supabase Studio: `http://127.0.0.1:54323`
- Local email inbox: `http://127.0.0.1:54324`

Useful lifecycle commands:

```bash
bun run local:status
bun run local:down       # keeps local data
bun run local:reset      # deletes local data, then migrates and seeds again
```

The local Supabase credentials are development defaults and must never be used
in production. Docker may publish the development ports beyond localhost, so
run this stack only on a trusted network.

Build the widget package:

```bash
bun run build
```

Build the dashboard:

```bash
bun run build:dashboard
```

Run tests:

```bash
bun run test
```

Typecheck everything:

```bash
bun run typecheck
```

## Compatibility

The legacy route remains available:

```text
GET    /api/comments?projectId=...
POST   /api/comments
PATCH  /api/comments
DELETE /api/comments
```

That path is kept for backward compatibility and smoke validation. New product work should target `/api/v1/...`.

## Self-host

CRRT is OSS-first. [crrt.ai](https://crrt.ai) is the easiest path — a managed hosted instance with auth, storage, and the agent bridge all wired up. But the same code in this repo runs on your own infra in under twenty minutes if you'd rather own the stack.

### What you'll need

- **Postgres** for the data layer. Any provider works; we recommend [Supabase](https://supabase.com) so you get auth + storage out of the box — that's what the hosted instance runs on.
- **A runtime** that can serve the Vercel-style serverless functions in `api/` plus the static builds in `apps/landing/` and `apps/dashboard/`. We deploy to Vercel; Fly, Render, Cloudflare Workers, or a Node container behind a reverse proxy all work as long as your function runtime is compatible with `@vercel/node`.
- **Bun ≥ 1.1** for the build (`bun install`, `bun run build`).

### 1. Clone and install

```bash
git clone https://github.com/thedesignproject/CRRT.git
cd CRRT
bun install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the required server variables (see [Environment variables](#environment-variables)):

- `SUPABASE_URL`, `SUPABASE_KEY` — your Postgres + auth provider
- `REVIEWER_API_TOKEN` — long random string; gates the reviewer API endpoints
- `SHARE_TOKEN_SECRET` — long random string; signs per-share bearer tokens

And the client-side equivalents for the widget + dashboard:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the dashboard reads these to talk to Supabase Auth.

### 3. Apply the database schema

```bash
bun run db:migrate
```

`deploy-build` does this on every deploy, but the first time you'll want to run it locally so the schema is in place before you push.

### 4. Deploy

If you're targeting Vercel:

```bash
vercel deploy
```

The `vercel.json` at the repo root sets `buildCommand` to `bun run deploy-build`, which typechecks, builds the landing app to `apps/landing/dist`, builds the dashboard into `apps/landing/dist/dashboard`, and runs pending migrations. Both surfaces ship in one deploy.

If you're targeting another runtime, the relevant outputs are:

- `apps/landing/dist/` — static landing page
- `apps/landing/dist/dashboard/` — static dashboard SPA (build with `bun run build:dashboard`)
- `api/` — Vercel-style serverless handlers; adapt them to your platform if needed

### 5. Smoke test

```bash
curl -s "$APP_URL/api/v1/public/comments?projectKey=demo-project"
```

You should get a JSON response (empty array on a fresh DB, or the seeded demo project's comments if you ran `bun db:seed`).

### Updates

We tag widget releases on npm but the OSS server-side moves on `trunk`. Pull periodically; `bun run db:migrate` is idempotent so re-running it after a fetch is safe.

### Versioning between hosted and self-hosted

`crrt.ai` runs whatever is on `trunk`. If you self-host, you can pin to a tag (`git checkout v0.x.y`) for stability. We aim to keep the public API surface backward-compatible across minor versions.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
