# Storybook backend verification on local Docker Supabase

Date: 2026-10-15
Branch: `feat/tdp-5793-storybook-auth`

All 13 verification groups passed through real HTTP API routes, Supabase Auth, and PostgREST. The HTTP checks passed again after the privacy and race fixes. Deterministic database concurrency tests also passed.

## Local environment

- Existing CRRT Docker Supabase stack: gateway `http://127.0.0.1:54321`, database port `54322`.
- Temporary API instances used this worktree's `scripts/local-api.ts` on ports `3193` and `3194` for Community and Cloud eligibility checks.
- The local database already had Cloud billing guards enabled. Temporary projects were created through `claim_project` with a temporary eligible billing account, preserving those guards and the existing deployment settings.
- Initially applied two local migrations during implementation and review. Before publication, consolidated them into `0042_storybook_private_feedback.sql` at the user’s request; fresh database verification is recorded below.
- Applied the existing local setup's service-role table grant to the new `storybook_connections` table and refreshed the PostgREST schema cache.
- Used temporary owner, member, guest, and outsider accounts with real Supabase password login. Account and session credentials were kept out of the report.

## Passed checks

| Group | Verified behavior |
| --- | --- |
| Supabase authentication | Admin-created temporary accounts could authenticate through the real Auth service. |
| Pairing | Only owners could create codes; stored codes were hashed and expired after five minutes; CLI validation worked without Origin; eight concurrent claims returned one connection. |
| CORS and signed-out access | Preflight returned the exact origin without cookie credentials; malformed Origin was denied; signed-out eligibility returned `401`. |
| PKCE and replay | Authenticated handoff succeeded; wrong verifiers failed; six concurrent exchanges produced one credential; replay failed; ordinary widget exchange rejected a Storybook handoff. |
| Private submission context | Real PostgREST insertion preserved story ID, component and variant footer, deep-link URL, and trusted account author identity. |
| Activity notifications | All three permitted project members received the existing activity notification, including aggregated subsequent activity. |
| Request scope and validation | Empty comments, mismatched story selector, wrong project, wrong exact origin/port, and a changed project allowlist failed closed. |
| Existing permissions | Guests could leave permitted feedback while Agent eligibility remained denied; admin-only private settings blocked member feedback. |
| Public compatibility | Anonymous public Storybook feedback succeeded; anonymous private feedback stayed denied. |
| Session expiry and membership revocation | A known expired token returned `419`; removing membership immediately denied eligibility and submission. |
| Cloud eligibility | The owner received `upgrade_required`, the member received `owner_upgrade_required`, and an active Pro account returned `ready` with the current nine-collaborator limit. |
| Connection lifecycle | Expired pairing validation/claim failed; owner status omitted hashes; owner revocation denied further eligibility and submission. |
| Database access boundary | The real anon key could not read pairing records or execute the privileged claim RPC. |

## Review fixes and concurrency regressions

The read-only review identified origin-removal and ownership-transfer races, plus a lower-priority post-insert response privacy gap. The fixes were re-reviewed read-only with no remaining actionable issue found.

- A comment request was held behind the project's settings lock. After the transaction removed its allowed origin and committed, the waiting submission failed with `access_denied`.
- Former-owner list and revoke requests were held behind an ownership-transfer transaction. Both failed after the transfer committed, and the connection remained unrevoked. The new owner could list and revoke it.
- A comment insertion returned a shared, unassigned snapshot. A later internal visibility/workflow update changed the stored row without changing that response snapshot. The HTTP handler no longer calls an unrestricted post-insert comment reload.
- Database allowlist checks also covered exact domains, subdomains, bracketed IPv6, malformed origins, and false suffix matches.
- The new snapshot/management RPCs deny execution to `anon` and `authenticated` and explicitly exclude secrets from connection status.

Validation after the fixes: 2,555 full-suite tests passed; 14 database/migration tests passed separately; all 13 HTTP groups passed; typecheck and Drizzle consistency checks passed; diff line and branch coverage reached 100% against `origin/trunk`, including a working-tree branch check.

## Cleanup and scope

The final run exited successfully after deleting its temporary comments, projects, accounts, billing rows, and usage records. Database checks confirmed zero temporary projects and accounts remained. The separate verification API instances were stopped; the existing Supabase stack stayed running.

## Local addon browser rehearsal

The sibling `crrt-storybook` clone now contains the matching frontend integration on `feat/tdp-5793-backend-auth`, based on the existing TDP-5796 addon branch. CRRT's widget-auth continuation accepts the public connection ID and routes it to Storybook's handoff endpoint.

Verified in Chrome with the local Docker Supabase stack:

- Opened the CRRT panel in Storybook at `http://127.0.0.1:6007/`.
- Signed in through the CRRT popup at `http://127.0.0.1:4328/dashboard/widget-auth`; the popup closed and the panel showed Connected to CRRT.
- Submitted manual private feedback and confirmed it appeared in the dashboard with the component, variant, story ID, and deep link preserved.
- Refreshed Storybook, confirmed its in-memory session was gone, and reconnected with one click using the existing dashboard login.
- Switched to Icon Only Broken and dispatched a failed accessible-name check; it showed Sent and linked to the actual `/dashboard/` path.

The addon sends scoped bearer tokens with cookies omitted, validates the popup source/origin/state, handles expiry, and does not put credentials in config or the build. The existing preset's dynamic environment access was corrected so public connection metadata reaches the manager. A stale unauthorized response cannot clear a newer login session.

Final checks: 25 addon tests, addon typecheck, Storybook build, package-content verification, CRRT typecheck, 2,557 full-suite tests, and 100% diff line/branch coverage passed.

A dedicated local demo account/project and two example feedback items remain for the user to try. The API (3193), dashboard (4328), Storybook (6007), and Docker Supabase stay running locally; nothing was published.

## Consolidated migration verification

At the user's request, the two unpublished local migrations were consolidated into 0042 before PR creation. The disposable database was restored to the pre-0042 Storybook schema, then the repository migration runner successfully applied the consolidated file. All 13 database/migration tests passed, including the privacy and concurrency regressions. Drizzle consistency and typecheck passed. The four transactional function definitions matched the running local demo database exactly; its local migration ledger was reconciled to the consolidated checksum without changing schema or demo data. The final full suite passed 2,556 tests (one redundant forward-migration test was removed), and both changed-line and changed-branch coverage remained 100%.
