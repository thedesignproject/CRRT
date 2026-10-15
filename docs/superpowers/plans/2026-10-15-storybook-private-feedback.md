# Private Storybook feedback implementation plan

Date: 2026-10-15

Issue: [TDP-5793](https://linear.app/tdp/issue/TDP-5793/launch-extend-current-widget-auth-to-private-storybook-feedback)

Extend CRRT's existing widget login, project permissions, and Agent entitlement checks to connected Storybooks. The first implementation step is to reconcile the addon's browser authentication transport with the widget session flow. Pairing identifies a connection; it must never authenticate a stakeholder.

## Current implementation

The starting checkout is `f6f1c40a`, after the Cloud billing and access changes. The working branch is `feat/tdp-5793-storybook-auth`.

| Responsibility | Existing implementation to reuse |
| --- | --- |
| Dashboard login and continuation | `apps/dashboard/components/LoginPage.tsx`, `WidgetAuthPage.tsx`, and `lib/widget-auth.ts` |
| Project and origin scoped session | `api/_lib/widget-session.ts` and `src/lib/widgetAuthContract.ts` |
| Hashed codes, random proofs, PKCE | `api/_lib/extension-auth-contracts.ts` |
| Durable widget session storage | `widgetAuthSessions` in `db/schema.ts` |
| Membership and feedback permissions | `api/_lib/auth.ts` and `api/_lib/project-capabilities.ts` |
| Agent entitlement and role states | `api/_lib/billing/agent-entitlement.ts` |
| Feedback creation and notification behavior | `api/v1/public/comments.ts` and `api/_lib/store.ts` |

There are no Storybook pairing or connection endpoints in this checkout.

The addon frontend is in [crrt-storybook PR 1](https://github.com/thedesignproject/crrt-storybook/pull/1), branch `feat/tdp-5796-crrt-pro-storybook`. Its [connection design](https://github.com/thedesignproject/crrt-storybook/blob/feat/tdp-5796-crrt-pro-storybook/docs/superpowers/specs/2026-10-13-crrt-pro-storybook-connection-design.md) defines the CLI contract. The backend is implemented locally on the working branch. The final backend contract is documented in `docs/storybook-api.md`; addon and dashboard login-continuation wiring remains subsequent work.

## Resolve browser authentication first

The addon currently calls eligibility and private comments with `credentials: "include"`, without an Authorization header. Its sign-in action opens a server-provided `actionUrl` in a new tab with `rel="noreferrer"`.

CRRT currently authenticates the widget differently. `WidgetAuthPage` uses the existing dashboard login and sends a handoff code to `window.opener` with an exact target origin. The widget exchanges the code using state and a PKCE verifier, then sends an opaque `crrt_widget_…` bearer token. Server-side lookup binds the credential to a project, origin, and expiry. Dashboard requests authenticate with a Supabase bearer token; the inspected flow does not establish the API cookie expected by the addon.

**Proposed transport:** extend the existing widget popup and PKCE exchange to the addon, then send the resulting scoped widget bearer token to the Storybook endpoints. Keep the account token inside the CRRT dashboard. Keep scoped session credentials in runtime memory, outside `.storybook/crrt.json`, build output, and URLs. Retain the four endpoint paths already used by the addon.

The addon needs an explicit sign-in action that creates the verifier and state, opens the CRRT login continuation, checks the message origin and source window, exchanges the handoff, and refreshes eligibility after completion. Its current plain link cannot complete this popup protocol. The dashboard continuation must resolve the connection to its server-owned project and bind the handoff to that connection as well as the request origin. A widget token for another connection must not become valid just because it shares a project.

If cookie transport is retained instead, specify cookie issuance, scope, expiry, CSRF defenses, credentialed CORS, and behavior when cross-site cookies are unavailable before implementation. `credentials: "include"` alone does not connect the current login flow to Storybook. This is a contract change to coordinate with the addon work, not a reason to add another identity or entitlement system.

## Pairing and connection contract

| Endpoint | Request | Success |
| --- | --- | --- |
| Proposed `POST /v1/storybook/pairings` for the CRRT setup card | Authenticated owner, selected project | Short-lived code and expiry; exact setup-card response to coordinate with TDP-5795 |
| `POST /v1/storybook/pairings/validate` | `{ code }` | `{ valid: true, expiresAt }` |
| `POST /v1/storybook/pairings/claim` | `{ code, storybookVersion, addonVersion, packageManager }` | `{ connectionId, projectKey, apiBase, dashboardUrl }` |
| `GET /v1/storybook/connections/:connectionId/eligibility` | Scoped browser session and request origin | `{ state, message?, actionUrl? }` |
| `POST /v1/storybook/connections/:connectionId/comments` | Scoped browser session and existing comment payload | `201` with comment `id` |

Only the creation endpoint is a proposed addition to the published CLI/panel contract. TDP-5795 also needs a connection-status read path for its waiting/connected state; define that with the setup-card implementation.

Pairing implementation requirements:

- Mint codes only after authenticating the owner and checking the existing project and plan rules. Recheck authorization when claiming; a revoked owner cannot finish an old pairing.
- Use cryptographically random codes, store only hashes, and enforce a proposed five-minute lifetime on the server. Never log raw codes.
- Validation must not consume a code. A successful claim creates exactly one public connection identifier. Retry of that same code returns the same metadata only while the code remains valid; it cannot create another connection or mint a browser credential.
- Make creation and claim durable and atomic across concurrent requests, with database constraints or a locked transaction. Do not use process-local maps.
- Persist only public metadata in addon configuration. Derive API and dashboard URLs from trusted deployment configuration.
- Keep CLI validate/claim independent of browser cookies and Origin headers. Browser eligibility/comments require the browser-specific checks.

Add connection and pairing storage through `db/schema.ts`, generate migrations with `bun run db:generate`, inspect the SQL, and include the snapshot and journal. Preserve Supabase as the runtime query layer. Bind Storybook sessions to connections through an additive extension to the existing session model.

## Access and eligibility

Resolve the project from the stored connection. If the payload supplies `projectKey`, require an exact match. Check the current project, allowed origin, membership, and operation capability on every private submission. A valid session must stop working after membership revocation or connection revocation.

Use `resolveWidgetAgentAccess` for Agent eligibility. Preserve its distinctions and map them at the Storybook boundary:

| Existing result | Addon response |
| --- | --- |
| No scoped session | `authentication_required` |
| Expired scoped session | `session_expired` |
| `project_access_denied` or `forbidden` | `access_denied` |
| `upgrade_required` | `upgrade_required` |
| `owner_upgrade_required` | Stable `code` alias with explanatory message; the addon maps it to `upgrade_required` on non-success responses |
| `seat_limit_reached` | `seat_limit_reached` |
| `ready` | `ready` |

The current resolver does not return `seat_limit_reached` for existing members: its policy permits existing membership after a downgrade and limits additions. Preserve that policy; cover the state at boundaries where seat admission can reject an operation. Do not invent a separate Storybook seat count.

Keep feedback permission separate from Agent eligibility. Guest feedback and private project feedback settings use the current capability policy. Confirm how connected Storybooks should expose allowed feedback when Agent access is denied: the addon currently gates its send UI on Agent-style `ready`. Document and test the agreed behavior rather than changing billing rules implicitly.

## Submission context and public compatibility

The current addon already sends `projectKey`, `pageUrl`, `selector`, finite `x`/`y`, `body`, and optional `authorName`. It puts the story deep link in `pageUrl`, the story ID in `selector` as `storybook://<storyId>`, and component title, variant name, and ID in a footer in `body`. Preserve those values. Do not claim that this version sends separate structured story fields.

Reuse comment validation, creation, notification, and plan enforcement behavior rather than invoking the public HTTP handler with mutated credentials. Derive the authenticated author from the session. Validate URL protocol, exact origin, lengths, selector format, and project consistency before insertion. Extract shared comment-ingestion logic only where needed, retaining existing callers' behavior.

Manual public configurations continue using `/v1/public/comments` with optional login. Existing private-project rejection remains enforced there. Failed connected/private submissions never fall back to the public endpoint. Return a `message` field on Storybook errors because the addon currently reads it, plus stable `code` values where relevant.

## Implementation sequence

1. Specify and test the browser handoff against the existing login flow, including the addon transport change and connection binding. Establish private-feedback versus Agent eligibility behavior.
2. Add durable pairing/connection persistence, atomic claim behavior, expiry, and revocation. Document the setup-card creation/status contract for TDP-5795.
3. Implement CLI validation and claim endpoints against the exact TDP-5796 request and response shapes.
4. Extend existing session helpers and login continuation; implement connection eligibility with current membership and entitlement checks.
5. Implement authenticated comments using shared ingestion behavior and preserve the existing public path.
6. Publish the final endpoint contract with request/response examples and run integration checks against the real addon package. Coordinate release with TDP-5792 and TDP-5797; use TDP-5798 for the paid workflow rehearsal.

## Required verification

- Pairing: missing/malformed codes, expiry boundaries, non-consuming validation, replay after expiry, interrupted-response retry, concurrent claims producing one connection, database failure, and creator permission revocation.
- Session: signed out, malformed credential, expiry, state/PKCE mismatch, concurrent exchange, code replay, wrong project, wrong connection, wrong origin, revoked membership, and revoked connection.
- CORS: allowed and disallowed origins, preflight, malformed or `null` origins, and exact origin handling. Do not use wildcard CORS with cookies if that transport is selected.
- Access: owner, admin, member, guest, private feedback settings, upgrade/owner-upgrade states, seat-admission failures, downgrade behavior, and entitlement lookup failure.
- Comments: malformed bodies, spoofed author/project, URL and selector mismatch, preserved component/variant footer and story deep link, public optional login, private public-endpoint rejection, and no fallback on private errors.
- Browser integration: complete sign-in from a local and hosted Storybook, retry eligibility after login, and confirm config/build output contains no account token or pairing code.
- Run typecheck and appropriate unit/database tests. Invoke `.agents/skills/diff-coverage` after code changes and require 100% changed-line and changed-branch coverage against the PR base. Backend runtime code and the single consolidated migration 0042 include the review fixes. The sibling addon now uses the backend authentication flow.
