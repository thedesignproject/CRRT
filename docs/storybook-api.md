# Storybook backend API

The Storybook API extends CRRT widget sessions, project permissions, and Cloud entitlements. All paths below are relative to `APP_URL + /api`. Configure `APP_URL` as a canonical HTTPS origin, or an HTTP localhost origin for development. Responses use `Cache-Control: no-store`.

## Authentication boundary

A connection ID and project key are public configuration. Neither authenticates a user. Pairing codes are 256-bit random values, hashed at rest, valid for five minutes, and never written into Storybook configuration. The CLI receives only `{ connectionId, projectKey, apiBase, dashboardUrl }`.

Browser authentication reuses widget PKCE handoff and exchange. Account tokens stay in the CRRT dashboard. The addon holds only the scoped `crrt_widget_…` token in runtime memory. That credential expires after one hour and is bound to the project, connection, and exact browser origin, including scheme and port. It cannot access dashboard APIs or ordinary widget endpoints.

The local addon integration on `feat/tdp-5793-backend-auth` uses `Authorization: Bearer <scoped-token>` and `credentials: "omit"`. The dashboard widget-auth continuation accepts a public `connectionId` and calls the Storybook handoff endpoint below, returning only the handoff code and state to the originating popup. Account tokens remain in the dashboard. The earlier addon PR's cookie-only transport is superseded by this integration.

All browser requests to exchange, eligibility, and comments require a canonical `Origin` header. CORS reflects a valid origin, permits `Content-Type, Authorization`, and never enables cookie credentials. Actual session authentication checks the stored exact origin and current project domain allowlist. CLI validation and claim may omit `Origin`.

## Pairing and setup status

`POST /v1/storybook/pairings` requires the dashboard account bearer token and an eligible project owner:

```json
{ "projectKey": "project-public-key" }
```

Returns `201`:

```json
{
  "code": "<43-character-base64url-code>",
  "expiresAt": "2026-10-15T12:05:00.000Z",
  "connectionId": "11111111-1111-4111-8111-111111111111"
}
```

`POST /v1/storybook/pairings/validate` accepts `{ "code": "…" }` and returns `200` with `{ "valid": true, "expiresAt": "…" }`. It does not consume the code. Invalid, expired, or revoked codes return `400` with `code: "invalid_pairing"`. Creator access and plan eligibility are checked again.

`POST /v1/storybook/pairings/claim` accepts:

```json
{
  "code": "<43-character-base64url-code>",
  "storybookVersion": "10.4.6",
  "addonVersion": "0.2.0",
  "packageManager": "pnpm"
}
```

`packageManager` must be `npm`, `pnpm`, `yarn`, or `bun`. Version fields are bounded strings for diagnostic metadata; package compatibility is checked by the addon CLI.

Returns `200`:

```json
{
  "connectionId": "11111111-1111-4111-8111-111111111111",
  "projectKey": "project-public-key",
  "apiBase": "https://crrt.ai/api",
  "dashboardUrl": "https://crrt.ai"
}
```

The first successful claim records its client metadata. Concurrent claims and interrupted-response retries return the same connection during the code's five-minute lifetime. No retry creates a second connection or issues a session. After expiry, generate a new pairing code. Connection IDs remain valid after the pairing code expires, until revoked or deleted with the project/creator.

`GET /v1/storybook/connections?projectKey=…` requires the project's owner account token. It returns `{ "connections": [...] }`, newest first, up to 50 entries. Rows expose `id`, `project_key`, `created_by`, `expires_at`, `claimed_at`, and `revoked_at`; they do not expose code hashes or session credentials. Use `claimed_at` for setup completion, `expires_at` for an unclaimed code's expiry, and `revoked_at` for disconnection.

`DELETE /v1/storybook/connections?projectKey=…&connectionId=…` requires the owner account token and returns `{ "revoked": true }`. Existing tokens stop working against the connection. Listing and revocation remain available after a plan downgrade. Ownership is checked under the project lock in the same transaction as the read or revocation, so a completed ownership transfer invalidates a waiting former-owner request.

## Browser login handoff

1. The addon generates a random 43-character base64url verifier and state in memory. Compute `codeChallenge = base64url(SHA256(verifier))`.
2. Open the CRRT login continuation. After existing dashboard login, the dashboard calls `POST /v1/storybook/auth/handoff` with its account bearer token:

```json
{
  "connectionId": "11111111-1111-4111-8111-111111111111",
  "origin": "http://localhost:6006",
  "state": "<43-character-base64url-state>",
  "codeChallenge": "<43-character-base64url-SHA256-challenge>"
}
```

3. The backend resolves the project from the claimed connection and checks current feedback membership and the configured project domain allowlist. It returns `201` with `{ "code": "…", "state": "…" }`. The code expires in five minutes.
4. The dashboard sends the code and state to the originating addon window using an exact `postMessage` target origin. The addon verifies the CRRT message origin, source window, and matching state.
5. The addon sends `POST /v1/storybook/auth/exchange` from its own origin:

```json
{
  "connectionId": "11111111-1111-4111-8111-111111111111",
  "code": "<handoff-code>",
  "state": "<matching-state>",
  "verifier": "<original-verifier>"
}
```

6. The backend atomically consumes a matching handoff once and returns `200` with `{ "accessToken": "crrt_widget_…", "displayName": "…", "expiresAt": "…" }`. A wrong connection, origin, state, verifier, expired code, or replay cannot mint another token. Membership and connection access are checked again when using the token.

Do not put an account token, scoped token, verifier, or pairing code in `.storybook/crrt.json`, the Storybook build, or a URL. A login continuation can carry public connection metadata, state, and the PKCE challenge.

## Eligibility

`GET /v1/storybook/connections/:connectionId/eligibility` requires the scoped browser token. A successful response is:

```json
{ "state": "ready", "role": "member", "collaboratorSeatLimit": 9 }
```

Role and seat limit follow the existing Agent resolver. No separate Storybook entitlement or seat policy exists. Existing members remain usable after capacity is reduced; seat limits block additions according to current policy.

Failures return a stable `code` and `message`; access failures also include `state`:

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Malformed request or story context |
| 400 | `invalid_pairing` | Pairing code unavailable; generate another |
| 401 | `authentication_required` | Scoped token absent, invalid, or unavailable |
| 419 | `session_expired` | Recognized connection/origin-bound token has expired |
| 403 | `access_denied` | Connection, origin, project, or feedback membership denied |
| 403 | `project_access_denied` or `forbidden` | Existing Agent resolver denies access |
| 402 | `upgrade_required` | Owner needs an eligible plan |
| 402 | `owner_upgrade_required` | Member must ask the owner to upgrade |
| 409 | `seat_limit_reached` | Existing entitlement boundary reports a seat failure |
| 402 or 409 | `plan_limit` | Existing Cloud subscription or usage limit; response includes resource, usage, limit, resetAt, and action |
| 405 | `method_not_allowed` | Unsupported HTTP method |
| 500 | `error` | Backend or entitlement lookup failed; private access fails closed |

The current addon accepts the Agent error aliases on non-success responses. It does not accept `owner_upgrade_required` as a successful `state`, so that condition remains an HTTP `402` error with the alias in `code`.

Agent eligibility and permission to leave feedback are distinct. Guests may leave feedback where current project settings permit it, even when `agent:operate` is unavailable. The addon UI must preserve that distinction when it wires these endpoints.

## Comment submission

`POST /v1/storybook/connections/:connectionId/comments` requires the scoped browser token:

```json
{
  "projectKey": "project-public-key",
  "pageUrl": "http://localhost:6006/?path=/story/button--primary",
  "selector": "storybook://button--primary",
  "x": 50,
  "y": 50,
  "body": "Adjust spacing.\n\n— via Storybook · component: Button · story: Primary · id: button--primary"
}
```

The project must match the connection and session. The page must have the exact session origin. `pageUrl` is limited to 2,048 characters, `selector` to 1,000, and trimmed `body` to 8,000. Coordinates must be finite numbers. The `?path=/story/<storyId>` deep link must match the `storybook://<storyId>` selector. Unknown fields, including caller-supplied author identity, are ignored.

Returns `201` with the normal CRRT comment object, including `id`. The stored comment preserves the page URL, selector, and component/variant footer. The author comes from the session; default review and implementation states are preserved. The insert transaction rechecks membership, privacy settings, the current origin allowlist, connection revocation, and session expiry. The response maps the insertion snapshot; it never reloads a comment after another actor can make it internal. Existing comment limits and activity notifications apply.

There is no automatic fallback to public ingestion. Manual public configurations continue to use `/v1/public/comments` with optional login, and anonymous private-project submissions remain rejected. The existing addon body/footer is supported without adding a second story metadata schema.

## Database and verification

`0042_storybook_private_feedback.sql` adds `storybook_connections` with deny-all RLS, an optional connection foreign key on widget sessions, and service-role-only transactional claim/comment functions. Existing widget sessions keep their behavior through a null connection scope. The same migration includes service-role-only functions that fence origin and owner checks and return the insertion snapshot. The unpublished local migrations were consolidated before opening the PR.

Run:

```sh
bun run typecheck
bun run test:coverage
bun run test:diff-coverage -- origin/trunk
```

The database test requires a disposable local database named `crrt_storybook_backend_test` with the existing application/auth schema plus migration 0042. It refuses other database names and non-local hosts:

```sh
STORYBOOK_DB_TEST=true DATABASE_URL='<local-test-database-url>' bun run test -- db/storybook.integration.test.ts
```

The local cross-repo browser rehearsal passed: sign-in popup, scoped exchange, private feedback submission, and display of the story context in the dashboard. The updated addon and dashboard handoff must ship together; the earlier cookie-only addon transport remains incompatible.
