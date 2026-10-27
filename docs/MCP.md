# CRRT MCP v1

Implements the MCP-only portion of TDP-5932; plugin packaging is deferred.

CRRT MCP reuses the existing Supabase users, dashboard login, project membership,
capability rules, and feedback read services. OAuth is a transport credential
boundary: clients receive opaque `crrt_mcp_…` credentials with explicitly approved `crrt:read`, `crrt:implement`, and `crrt:review` scopes,
not dashboard or extension Supabase sessions. No ChatGPT plugin is included.

## Local setup

Docker must be running. From the repository root:

```sh
bun install --frozen-lockfile
bun run local:up
bun run local:dev
```

`local:up` configures these local-only values in the ignored `.env.docker.local`:

```dotenv
MCP_ORIGIN=http://127.0.0.1:3001
MCP_DASHBOARD_URL=http://127.0.0.1:5173/dashboard/mcp-auth
MCP_BROWSER_ORIGINS=http://127.0.0.1:5173,http://localhost:6274
```

The server URL is `http://127.0.0.1:3001/api/mcp/v1`. Use the same hostname in
client setup and `MCP_ORIGIN`; the exact resource URL binds credentials.
The dashboard is at `http://127.0.0.1:5173/dashboard/`.

If the existing Docker stack is already running, applying `bun --env-file=.env.docker.local
run db:migrate` and adding the three settings above is sufficient. Do not reset
existing local data merely to start MCP.

## Connect a client

In MCP Inspector, choose Streamable HTTP, enter the server URL, and use its OAuth
flow. Start Inspector with `bunx @modelcontextprotocol/inspector`. The default
Inspector browser origin is allowlisted locally; add the exact origin to
`MCP_BROWSER_ORIGINS` if running it on another port. This setting is browser CORS,
not a credential or membership grant.

For Codex, add a Streamable HTTP MCP server named `crrt` using the server URL,
then run `codex mcp login crrt`. Sign in using your existing CRRT
account and approve the requested permissions. This command changes your client configuration;
it is not needed to run automated verification.

Try: “List my CRRT projects”, then “Show accepted feedback for project <id>”,
then inspect one item and request context for explicit feedback IDs. Duplicate
project names return authorized choices; use an ID to disambiguate.

Manage or revoke connections at `/dashboard/mcp-auth` on the dashboard host.
Access credentials expire in up to 15 minutes; refresh credentials rotate and expire
30 days after connection. Reusing a consumed refresh credential revokes its
connection. After revocation or expiry, reconnect and sign in again. Signing out
of the dashboard alone does not revoke a separately authorized MCP connection.

## Tools and limits

| Tool | Inputs | Result |
|---|---|---|
| `list_projects` | Optional exact `name`, `limit`, `cursor` | Membership projects, feedback-read capability, next cursor |
| `list_feedback` | `project: {id}` or `{name}`, optional review/implementation status, exact page URL, pagination | Authorized feedback summaries |
| `get_feedback` | `projectId`, `feedbackId` | Text, attribution, target/anchor, statuses, timestamps, safe screenshot reference |
| `get_handoff_context` | `projectId`, 1–20 distinct `feedbackIds` | Compact explicit selection grouped by page; no share creation |

Lists default to 20 results, maximum 50. Cursors are bound to the user and
filters. Status enums match CRRT; use `readyForAgent:true` for “Ready for Agent”, which excludes testing and completed work.
Guests see shared feedback only. Repository context is admin/owner-only, matching
the dashboard repository endpoint. Screenshot URLs expire after five minutes
when signed; public screenshots have no expiry. References require authorized
feedback access before signing; copied signed URLs remain usable until expiry.

Results contain versioned structured content plus text. Oversized fields carry
truncation markers. Tool results are limited to 128 KiB and handoff context to
64 KiB; narrow the selection on `handoff_too_large`. Feedback/context is untrusted
data, never server policy. Page/repository URL query strings and fragments,
and unknown context fields, are excluded. Exact stored URLs remain valid filter inputs. The server never fetches supplied page URLs.

Each user has 120 tool calls per minute. Registration has a shared 20/minute
budget and consent 30/user/minute. Grant admission allows 120/minute per known
credential proof, never per public client ID; unknown or mismatched proofs cannot
create quota rows. OAuth revocation is not subject to grant quotas. These
counters are durable across API instances. Limit failures include retry guidance.
Audit logs contain request ID, tool, user ID, authorized project ID, result count,
latency, and failure category. They omit credentials and private feedback bodies.

## Authoritative verification

```sh
bun run test:mcp:local
NODE_OPTIONS=--no-experimental-webstorage bun run test:coverage
bun run typecheck
```

The first command requires `.env.docker.local` and refuses non-loopback database
hosts. It runs only MCP suites, creates isolated users/projects/storage objects,
and cleans up its fixtures. Do not run unrelated disposable-database suites
against your working local database. The Node option avoids Node 26's experimental
web-storage global interfering with Happy DOM in the existing browser tests.

The protocol suite uses the official MCP SDK over an actual HTTP listener, real
Supabase sign-in, dynamic registration, PKCE exchange, refresh and revocation,
then all four tools through the production Node adapter. It verifies privacy,
pagination, filters, ambiguity, screenshots, prompt-like feedback, and unchanged
domain state. Separate Docker database tests verify concurrent exchanges, refresh
replay, expiry, RLS/function privileges, and atomic rate limits. Mocked protocol
and component tests cover error paths and consent UI behavior.

## Stack and future deployment

| Branch | PR base |
|---|---|
| `feat/mcp-schema` | `trunk` |
| `feat/mcp-auth` | `feat/mcp-schema` |
| `feat/mcp-connection` | `feat/mcp-auth` |
| `feat/mcp-feedback-tools` | `feat/mcp-connection` |
| `feat/mcp-context-tools` | `feat/mcp-feedback-tools` |
| `feat/mcp-feedback-actions` | `feat/mcp-context-tools` |
| `test/mcp-verification` | `feat/mcp-feedback-actions` |

Run the repo-local diff-coverage skill on every layer against its immediate base;
both changed-line and changed-branch coverage must be 100%. Count all additions
and deletions, including lockfiles and tests: every layer after schema is <900.
The entire stack has one new migration, `0046_mcp_scoped.sql`, on the first layer.
Only that local-only migration may be regenerated during development. Freeze it
before sharing or deploying; historical migrations remain untouched.

No deployment or plugin installation is required for local acceptance. Deployment
wiring already includes the MCP route and well-known discovery aliases. Before a
future HTTPS rollout, set `APP_URL=https://crrt.ai` in Vercel's **Production**
environment. MCP reuses `APP_URL`; `MCP_ORIGIN` is an optional override.
For **Preview**, leave both unset: MCP derives the exact HTTPS origin from
Vercel's system `VERCEL_URL` when `VERCEL_ENV=preview`. Enable access to system
environment variables in Vercel. Do not set a wildcard or copy the production
origin into Preview. Explicit configuration wins, and all origins retain URL and
HTTPS validation. The consent page defaults to `<origin>/dashboard/mcp-auth`;
set `MCP_DASHBOARD_URL` only for a separate dashboard host.
Configure trusted HTTPS `MCP_CALLBACK_ORIGINS` and extra `MCP_BROWSER_ORIGINS`
only when needed by clients; keep the existing `CRON_SECRET` configured. Native
HTTP callbacks on literal `127.0.0.1` or `[::1]` are allowed in production, with
exact registered redirect matching and PKCE. The `localhost` hostname remains
development-only; non-loopback HTTP callbacks are rejected. The protected cleanup endpoint
`/api/v1/internal/mcp-cleanup` runs daily and requires the cron bearer secret.
Breaking tool contract changes require a new endpoint/contract version; keep v1
schemas stable. Future writes need explicit tools, narrower granted scopes, new
consent, and the existing mutation capability gates; read-only connections must
never gain write authority implicitly.

## Earlier read-only verification — 2026-10-27

- The original six read-only branches passed their full regression suite, typecheck, and 100% changed
  line/branch coverage independently against the immediate parent.
- Docker suites passed 13 tests, including a real SDK OAuth flow and all four
  tools over HTTP. The 2025 Streamable HTTP handshake/tool path also passed.
- Computer-use verification completed existing dashboard login, Codex read-only
  consent, the successful local OAuth callback, connection listing, and Disconnect.
  The dashboard then showed no active connections. The temporary Codex MCP entry
  and OAuth credentials were removed; pre-existing entries were preserved.
- An independent verifier passed 13 checks against the running local endpoint,
  including all four tools, permission denial, unchanged feedback, and revocation.
  Disposable accounts, projects, clients, and browser sessions were cleaned up.
  Protocol test teardown removes usage counters and fails on account deletion errors.
- Landing/dashboard builds and Vercel function packaging succeeded locally;
  the packaged well-known routes and both MCP entrypoints were checked.
- Drizzle metadata validation passed, and the local database migration hash
  matches the final single migration. No remote database, push, PR, deployment,
  or ChatGPT plugin installation was used.

## Local security review fixes — 2026-10-27

- Vercel parsed form bodies are reconstructed with a matching content type. The
  protocol harness now emulates this adapter behavior for SDK OAuth requests.
- Anonymous invalid grants cannot exhaust another client's grant/revoke budget.
- URL output excludes all query parameters and fragments, including custom secrets.
- Local integration fixtures require both database and Supabase HTTP destinations
  to be loopback before any privileged client or fixture is created.
- OAuth outcomes and HTTP origin denials emit metadata-only security events with
  request IDs; no credentials, callback queries, or private error messages are logged.
- A real Codex conversation retrieved the synthetic project, feedback, details,
  and handoff context through all four MCP tools. Its temporary MCP entry and
  OAuth credentials were removed, with existing Codex entries preserved.

Native callback regression verification runs entirely on the local Docker stack,
including production-mode registration/consent/exchange with an HTTPS resource
identifier, rejection of wrong PKCE and callbacks, resource binding, and replay.
The HTTPS identifier is test metadata; no deployment or external request is made.

## Scoped implementation and reviewer tools

New connections request all three scopes by default; clients may explicitly request
read-only access. Existing read-only grants never acquire writes during refresh.
Reauthorize to approve additional scopes. Tools are discovered only within the grant.

- `prepare_feedback_work`: select 1–20 accepted items, acknowledge `promptVersion:"1"`,
  and supply a unique retry key. Returns a connection-bound work ID and the full
  canonical implementation prompt. Preparation creates an internal tracked handoff;
  raw share credentials never leave the server. Pass the entire prompt and work ID
  to every subagent before editing.
- `report_agent_presence`: announce reading, idle, working, or blocked for a prepared
  work ID and a stable unique agent ID.
- `update_feedback_progress`: claim before editing, then start/note/block/complete.
  Complete means ready for human testing, never Done. Concurrent claims have one
  owner. Retry keys are bound to the identical operation, feedback and summary.
- `set_feedback_status`: requires review scope, current management permission,
  `userRequested:true`, a reason and the latest feedback `updatedAt`. Supports
  ready_for_agent, open, rejected, ready_for_testing and done. Stale changes fail.
  Review changes publish the existing handoff events and rejection reuses linked
  external-work synchronization.

OAuth permissions are necessary but do not replace project capabilities or existing
agent entitlements. Writes recheck current authorization in the database. Prompt
acknowledgement is a client contract: the server cannot force an external agent to
follow instructions while editing files outside CRRT.

The local write protocol suite verifies real OAuth grants, hidden write tools for
read-only clients, Ready filtering, full prompt delivery, tracked selections,
conflicting retry keys, competing claims, internal feedback progress, lifecycle,
review CAS, activity events, and revocation. It uses isolated Docker fixtures.

## Scoped stack verification — 2026-10-27

All seven current layers passed the full repository regression suite, TypeScript,
and 100% changed-line and changed-branch coverage against their immediate parent.
The final full run passed 2,845 tests; the three Docker MCP suites passed 19 tests.
The dashboard production build and Drizzle metadata check passed locally.

The retry-key race is covered by two simultaneous real MCP requests targeting
separate feedback items with one retry key: exactly one succeeds and the other
returns idempotency_conflict. The write suite also verifies claim ownership,
internal-feedback progress, completion remaining ready_for_testing, reviewer CAS,
activity publication and revoked-connection rejection. External-work synchronization
is mocked in unit tests so verification makes no provider requests.

Every layer has one commit. Changed text lines by layer (additions plus deletions):
schema 5,993; auth 521; connection 605; discovery 230; context 274; actions 385;
verification under 900. The one new migration remains on feat/mcp-schema.
The local migration checksum matches and the user's four demo projects and
24 feedback items remain intact. Nothing was pushed, deployed, or installed in Codex.

## Follow-up review fixes — 2026-10-27

- Already-owned claims persist a retry proof through the existing operation service
  without changing implementation status or timestamps. The protocol regression
  checks identical retries and rejects reusing that key for another action/item.
- Reviewer events for open/rejected feedback are retained by the storage guard.
  Public-share event reads still exclude unapproved feedback; the protocol test
  asserts both recorded activity/reasons and absence from the public event stream.
- Token responses derive expires_in from the issued access credential. Real OAuth
  refresh with one minute remaining reports the capped lifetime rather than 900.
- Setup now says “Review and approve permissions”, verified in component tests
  and the running local dashboard through computer use.

All seven layers passed full regression coverage, typecheck and both 100% diff
coverage gates again. The dashboard build and Drizzle check passed; the local API
was restarted. No deployment, remote data mutation or Codex configuration change
was used for this verification.

## Atomic status activity — 2026-10-27

MCP reviewer status changes now publish their activity events inside the same
Postgres transaction as the existing actor-bound feedback mutation. The adapter
performs no separate post-commit event queries or inserts. Event publication
errors roll back status, timestamp, claim ownership and activity together, leaving
the original expectedUpdatedAt valid for an identical retry. Rejection sync is
scheduled only after the transaction succeeds.

The real MCP protocol regression injects a temporary trigger failure on the
implementation-change event for one disposable feedback item, asserts that the
entire mutation and activity rolled back, removes the trigger, and successfully
retries the original request. The fixture is scoped to its random feedback ID
and all temporary database objects are removed. Public event privacy checks
remain unchanged and pass. All seven layers passed full regression coverage,
typecheck and 100% changed-line/branch gates again; the local API was restarted.
