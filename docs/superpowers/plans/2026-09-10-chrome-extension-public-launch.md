# CRRT Chrome Extension Public Launch — Implementation Plan

**Design:** `docs/superpowers/specs/2026-09-10-chrome-extension-public-launch-design.md`

**Approved design commit:** `6b939dc`

**Baseline:** `origin/trunk` at `d617a1b` (`#250`)

**Release target:** public Chrome Web Store item, extension version `1.0.0`

## Outcome

Ship a public CRRT Chrome extension that a new or invited user can install, understand, authenticate, and use without developer help. The user explicitly activates CRRT on one tab, leaves private or authorized project feedback, and can hide it from that tab. Internal collaborators continue the review, Agent, and GitHub/Linear/Jira workflow from CRRT without leaking project data or provider credentials.

The release is complete only after the exact Store ZIP passes a clean-profile, two-user, three-provider smoke test against production.

## Delivery strategy

Use one documentation handoff PR followed by eight implementation PRs. Each implementation branch starts from the newly merged `trunk`; do not keep a long-lived seven- or eight-layer stack. PR 2 is the only intentionally multi-surface change because the server, hosted page, and extension must agree on one security protocol.

| PR | Branch | Depends on | Visible outcome |
|---|---|---|---|
| 0 | `docs/extension-public-release` | current trunk | Approved design and executable plan |
| 1 | existing `fix/extension-hide-launcher` | PR 0 | Hide/reactivate CRRT on only the chosen tab |
| 2 | `feat/extension-secure-auth-handoff` | PR 1 | Hosted sign-in returns a separate session securely to Chrome |
| 3 | `feat/extension-public-onboarding` | PR 2 | Disclosure and complete first-run/recovery states |
| 4 | `feat/extension-public-privacy` | PR 3 | Public privacy/support pages and matching disclosures |
| 5 | `fix/extension-least-privilege` | PR 4 | No blanket page permission or always-on content script |
| 6 | `build/extension-store-package` | PR 5 | Reproducible, validated MV3 Store ZIP |
| 7 | `docs/extension-store-listing` | PR 6 | Final listing copy, promo asset, screenshots, reviewer instructions |
| 8 | `test/extension-public-launch` | PR 7 | Automated and manual release evidence plus rollback runbook |

Merge in numeric order. A PR can be reviewed before its predecessor merges, but it must be rebased onto the merged predecessor and verified against that exact base before approval.

## Non-negotiable contracts

- The production extension ID is reserved through a draft Store upload and allowlisted server-side before final testing.
- `chrome.identity.launchWebAuthFlow()` uses a Chrome-generated `https://<extension-id>.chromiumapp.org/crrt-auth` redirect, a random state nonce, and PKCE S256.
- The URL carries only the opaque one-time CRRT code and state. It never carries a Supabase token, password, provider secret, or PKCE verifier.
- The handoff creates a new Supabase session for the extension. It does not copy or share the dashboard refresh token.
- The database stores only hashes and non-secret handoff metadata. It never stores the generated Supabase email token or returned session.
- Project membership authorizes access. A domain match only selects among projects already returned by the authenticated API.
- Guests can read and create shared project feedback. They cannot read internal feedback, review work, operate the Agent, configure projects, or use external integrations.
- Agent execution stays dashboard-only and human-authorized.
- No full page loads on install, startup, or unrelated tabs. No remote executable code.
- Every code PR reaches 100% changed-line and changed-branch coverage against its immediate base.

## Working-tree prerequisite

The original `crrt` worktree contains unrelated user changes and must remain untouched. Continue in clean sibling worktrees created from `origin/trunk`. Before each PR:

1. Fetch `origin/trunk`.
2. Confirm the prior PR is merged.
3. Create a clean branch/worktree from the new `origin/trunk`.
4. Read `AGENTS.md` and the applicable engineering, security, UX, business, and Drizzle rules.
5. Record any pre-existing check failure before editing.
6. Inspect the final diff against the immediate PR base, not the original release branch.

## PR 0 — Publish the approved design and plan

**Branch:** `docs/extension-public-release`

**Files:**

- `docs/superpowers/specs/2026-09-10-chrome-extension-public-launch-design.md`
- `docs/superpowers/plans/2026-09-10-chrome-extension-public-launch.md`

**Steps:**

1. Commit this plan after checking it for placeholders, contradictions, ambiguous security behavior, and mismatches with the approved design.
2. Open a docs-only PR whose body links the eight implementation units and states that no runtime behavior changes.
3. Ask Pranav to review the system boundaries and security contract before reviewing code PRs.

**Verify:**

```bash
git diff --check origin/trunk...HEAD
rg -n -i 'T[B]D|T[O]DO|F[I]XME|pending deci[s]ion' \
  docs/superpowers/specs/2026-09-10-chrome-extension-public-launch-design.md \
  docs/superpowers/plans/2026-09-10-chrome-extension-public-launch.md
```

**Commit:** `docs: plan Chrome extension public launch`

## PR 1 — Finish the current-tab launcher lifecycle

**Branch/PR:** existing `fix/extension-hide-launcher` / `#236`

**Base:** merged PR 0, then current `trunk`

### Files

- Update `apps/extension/entrypoints/background.ts`.
- Update `apps/extension/entrypoints/comment.tsx`.
- Update `apps/extension/lib/page-host.ts` and `apps/extension/lib/page-host.test.ts`.
- Update `apps/extension/lib/private-frame.tsx` and `apps/extension/lib/private-frame.test.tsx`.
- Update `apps/extension/tests/background.test.ts` and `apps/extension/tests/comment.test.tsx`.
- Update `src/components/FeedbackWidget/index.tsx` and `src/components/FeedbackWidget/types.ts`.

### Implement

1. Rebuild `#236` on the current base so its diff contains no already-merged `#235` code. Use `--force-with-lease` only after verifying the remote head has not changed.
2. Store activation as `{ origin }` under the tab-scoped `storage.session` key instead of a global boolean. Treat legacy boolean state as inactive.
3. Validate activation from the Chrome-provided sender tab and current origin. Clear stale state when the tab closes or navigates cross-origin.
4. Add `comment:deactivate`; derive the tab from `sender.tab.id` and never accept a caller-supplied tab ID.
5. Add an optional `WidgetPage.hide()` boundary used only by the extension surface.
6. Render the small accessible `Hide CRRT on this tab` control on launcher hover and keyboard focus using existing CRRT tokens. Do not show it on the npm widget.
7. On hide, disconnect host listeners, remove the isolated iframe/host, clear only that tab's activation, and allow a later toolbar click to inject a fresh surface.
8. Preserve duplicate-mount protection, SPA navigation behavior, BFCache cleanup, and npm-widget coexistence.

### Tests

- Activation affects only the Chrome-selected tab.
- A forged sender or caller-supplied tab ID cannot deactivate another tab.
- Same-origin state remains eligible while cross-origin navigation clears it.
- Closing a tab clears its state.
- Hide cleans listeners and DOM exactly once.
- The X appears on hover/focus, has an accessible name, and is keyboard operable.
- Reactivating after hide mounts one surface.
- The normal npm widget receives no hide control.

### Verify

```bash
bunx vitest run \
  apps/extension/tests/background.test.ts \
  apps/extension/tests/comment.test.tsx \
  apps/extension/lib/page-host.test.ts \
  apps/extension/lib/private-frame.test.tsx
bun run typecheck
bun run build:extension
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

**Commit:** `feat(extension): hide CRRT on the current tab`

## PR 2 — Add the secure hosted authentication handoff

**Branch:** `feat/extension-secure-auth-handoff`

**Base:** merged PR 1

This PR lands one protocol across persistence, API, hosted authentication, and the extension. Keep it reviewable as three commits: persistence/protocol, server endpoints, then hosted/extension clients.

### Files

**Persistence and server:**

- Update `db/schema.ts`.
- Generate the next `db/migrations/` SQL, snapshot, and journal entry.
- Add `api/_lib/extension-auth-contracts.ts` and `.test.ts`.
- Add `api/_lib/extension-auth-store.ts`, `.test.ts`, and `.integration.test.ts`.
- Add `api/v1/extension/auth/handoff.ts` and `.test.ts`.
- Add `api/v1/extension/auth/exchange.ts` and `.test.ts`.
- Add `api/v1/extension/auth/cleanup.ts` and `.test.ts`.
- Update `.env.example` and `vercel.json`.

**Hosted dashboard:**

- Add `apps/dashboard/components/ExtensionAuthPage.tsx` and `.test.tsx`.
- Update `apps/dashboard/App.tsx` and `apps/dashboard/App.extension-auth.test.tsx`.
- Update `apps/dashboard/components/LoginPage.tsx` and its tests.
- Update `apps/dashboard/api.ts` only for typed handoff calls.
- Use `route()` from `apps/dashboard/lib/routes.ts` for every dashboard path.

**Extension:**

- Update `apps/extension/lib/auth.ts` and `apps/extension/lib/auth.test.ts`.
- Update `apps/extension/entrypoints/background.ts` and `apps/extension/tests/background.test.ts`.
- Update `apps/extension/entrypoints/popup/main.tsx` only enough to expose the hosted sign-in action; full first-run UI remains PR 3.
- Update `apps/extension/env.d.ts` and `apps/extension/wxt.config.ts` to declare `identity`.

### Persistence contract

Add a deny-all-RLS `extension_auth_handoffs` table with:

- UUID `id`;
- unique SHA-256 `code_hash`;
- SHA-256 `state_hash`;
- `pkce_challenge`;
- authenticated `user_id` referencing `auth.users` through generated-migration adjustment;
- allowlisted `extension_id`;
- exact `redirect_uri`;
- `expires_at`, nullable `consumed_at`, and `created_at`;
- indexes for expiry and cleanup.

Do not store the raw code, raw state, verifier, dashboard session, generated Supabase email token, extension session, password, or OAuth/provider credential.

Add a service-role-only `consume_extension_auth_handoff` function in the newly generated migration. It locks one row, checks code hash, state hash, PKCE challenge, extension ID, redirect URI, expiry, and unused state, then marks it consumed and returns only user identity metadata. Concurrent or replayed exchanges must produce exactly one winner. Revoke execution from public roles.

The cleanup operation deletes consumed or expired metadata after its 24-hour retention boundary. Configure a daily Vercel cron in `vercel.json`; authenticate it with `CRON_SECRET`, and keep opportunistic cleanup on handoff creation so missed cron invocations do not accumulate rows indefinitely.

### Server protocol

`POST /api/v1/extension/auth/handoff`:

1. Require an authenticated dashboard bearer token with `requireUser`.
2. Validate base64url state, an S256 PKCE challenge, and the exact Chrome redirect shape.
3. Derive the extension ID from the redirect host. Do not trust a separate client-supplied ID.
4. In production, accept only IDs in `EXTENSION_ALLOWED_IDS`. Outside production, additionally accept explicit `EXTENSION_DEVELOPMENT_IDS`.
5. Generate a 256-bit random code, persist only its hash, and return the exact allowlisted redirect URL containing `code` and the original `state`.
6. Set `Cache-Control: no-store` and never log request bodies or returned codes.

`POST /api/v1/extension/auth/exchange`:

1. Require the extension Origin to match the ID encoded in the redirect URI and the environment allowlist.
2. Validate code, state, verifier, and redirect URI; derive the S256 challenge server-side. Return CORS headers only for the exact allowlisted extension Origin.
3. Atomically consume the handoff before minting a session.
4. Load the current auth user by stored user ID. Fail if removed or email-less.
5. Use the service-role client to generate a Supabase magic-link token for that existing email, then immediately verify the token server-side with a non-persistent Supabase client to create a distinct session. `generateLink` does not send an email.
6. Never persist or log that generated token. Return only the new access token, refresh token, expiry, and safe user summary over HTTPS with `Cache-Control: no-store`.
7. If minting fails after consumption, require a fresh handoff; never revive the used code.

This follows Supabase's documented admin `generateLink` plus `verifyOtp` boundary and avoids sharing the dashboard refresh token.

### Hosted and extension clients

1. The background creates 256-bit state and a PKCE verifier, stores the attempt only in `storage.session`, derives the S256 challenge, and calls `browser.identity.getRedirectURL('crrt-auth')`.
2. It launches `https://crrt.ai/dashboard/extension-auth` through `launchWebAuthFlow({ interactive: true })` only after the user presses Sign in/Create account.
3. The dashboard route preserves approved handoff parameters through password login, signup confirmation, magic-link login, password recovery, and optional invite acceptance.
4. Once authenticated, `ExtensionAuthPage` requests a handoff and performs `window.location.replace()` to the server-returned Chrome redirect. It does not construct arbitrary redirects itself.
5. The background validates the returned origin/path and state, then exchanges code plus verifier.
6. Pass the returned pair to `supabase.auth.setSession()`, verify the resulting user, and clear the attempt on every terminal path.
7. Sign-out remains local to the extension session and does not sign the dashboard out.

### Tests

- Schema uniqueness, deny-all RLS, expiry index, and atomic one-winner consumption.
- Malformed, non-S256, expired, mismatched, replayed, and concurrently exchanged handoffs fail closed.
- Production and development extension-ID allowlists never overlap implicitly.
- Open redirects, non-Chrome redirects, redirect path changes, and mismatched extension Origins are rejected.
- Create requires a real authenticated user; exchange never accepts a dashboard bearer token as a substitute for code proof.
- `generateLink`/`verifyOtp` is called only after atomic consumption and the generated token never enters persistence or API errors.
- Hosted auth preserves only allowlisted parameters and processes an invite before handoff creation.
- Cancellation, browser closure, state mismatch, and exchange failure clear attempt state.
- A successful flow stores a distinct extension session and does not expose tokens in the callback URL.
- Cron cleanup rejects missing/wrong `CRON_SECRET` and deletes only rows past retention.

### Verify

```bash
bun run db:generate
bunx drizzle-kit check
bunx vitest run api/_lib/extension-auth-contracts.test.ts
bunx vitest run api/_lib/extension-auth-store.test.ts api/_lib/extension-auth-store.integration.test.ts
bunx vitest run api/v1/extension/auth
bunx vitest run apps/dashboard --testNamePattern='extension auth|login|invite'
bunx vitest run apps/extension/lib/auth.test.ts apps/extension/tests/background.test.ts apps/extension/tests/popup.test.tsx
bun run typecheck
bun run build:dashboard
bun run build:extension
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

**Commits:**

- `feat(db): persist one-time extension auth handoffs`
- `feat(api): exchange extension handoffs for isolated sessions`
- `feat(extension): complete hosted CRRT authentication`

## PR 3 — Build the public first-run and recovery experience

**Branch:** `feat/extension-public-onboarding`

**Base:** merged PR 2

### Files

- Add `apps/extension/lib/disclosure.ts` and `.test.ts`.
- Add `apps/extension/lib/api-error.ts` and `.test.ts`.
- Update `apps/extension/entrypoints/popup/main.tsx`, `style.css`, and `apps/extension/tests/popup.test.tsx`.
- Update `apps/extension/lib/comments-api.ts` and `.test.ts`.
- Update `apps/extension/lib/personal-widget.tsx` and the focused extension widget tests.
- Update extension-facing API error helpers only as required to return a safe request ID without leaking internals.

### Implement

1. Add a disclosure version constant and local acceptance record. Show disclosure before auth or capture; incrementing the version forces re-acceptance.
2. Replace popup password fields with explicit `Sign in with CRRT` and `Create account` actions using the hosted flow.
3. State exactly when CRRT reads URL, page selection/screenshot, microphone input, shared/private audience, and tracker handoff. Link Privacy and Support.
4. After auth, show current page, resolved destination, audience, and `Start commenting` before injection.
5. Provide precise states for no session, no project, ambiguous domain, restricted page, offline/API failure, expired session, revoked project access, and unsupported microphone.
6. Keep `Private` available with no project. Never guess among multiple domain matches.
7. Model extension API failures as typed errors containing status, safe message, and request ID. A 401 offers reauthentication without clearing the in-frame draft; a 403 refreshes authorized destinations and clears stale project selection.
8. Keep guests on shared audience and omit Agent, settings, and integration controls.
9. Preserve the npm-widget coexistence behavior and the manual per-host project selection while it remains authorized.

### Tests

- Disclosure blocks auth/capture until accepted and reappears after a version change.
- Hosted sign-in/signup begins only after a direct user action.
- No-project and ambiguous-domain states never auto-select an unauthorized destination.
- Restricted URLs cannot activate scripting.
- Expired session prompts reauth while the draft remains mounted.
- Revoked membership removes the stored project choice on the next failed/refreshed request.
- Guest UI is shared-only and has no provider or Agent actions.
- Error copy shows the safe request ID and never raw provider/server output.

### Verify

```bash
bunx vitest run apps/extension
bun run typecheck
bun run build:extension
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

**Commit:** `feat(extension): add public first-run onboarding`

## PR 4 — Publish privacy, support, and data-use disclosures

**Branch:** `feat/extension-public-privacy`

**Base:** merged PR 3

### Files

- Add `apps/landing/legal/PrivacyPage.tsx` and `.test.tsx`.
- Add `apps/landing/legal/SupportPage.tsx` and `.test.tsx`.
- Update `apps/landing/App.tsx` and its route tests.
- Update `apps/landing/globals.css` only through existing tokens/patterns.
- Update `scripts/build-vercel-output.ts` and `vercel.json` for `/privacy` and `/support` SPA routing.
- Add `apps/extension/store-listing/data-use.md`.
- Add `apps/extension/store-listing/privacy-practices.md`.
- Update extension disclosure links/tests if final URLs differ.

### Implement

1. Publish `/privacy` with the exact data inventory from the design: account/session data, chosen page context, explicit feedback/capture data, local speech behavior, project visibility, external-work identifiers, subprocessors, retention/deletion, security, and user rights/contact.
2. Publish `/support` with install, sign-in, project invitation, restricted-page, provider reconnection, data-deletion, and incident-contact paths.
3. State that CRRT does not collect browsing history in the background, sell user data, use page data for unrelated advertising, or execute remote code.
4. State that screenshots/page content are captured only after explicit action and that GitHub/Linear/Jira receive data only after an authorized human confirms the editable draft.
5. Keep one canonical Markdown data inventory beside the Store answers. The landing copy and popup may summarize it but cannot contradict it.
6. Confirm the support mailbox is real and monitored before merge. Do not publish a guessed address.
7. Require owner/legal review of the policy language before Store submission; code review is not legal approval.

### Tests

- Direct loads and refreshes for `/privacy` and `/support` render in local and generated Vercel output.
- Links are keyboard accessible, base-safe, and use CRRT tokens.
- A content contract test checks required data categories, providers, deletion path, and contact information exist in both the public policy and Store answers.
- No placeholder, future-tense, or unsupported privacy promise remains.

### Verify

```bash
bunx vitest run apps/landing
bunx vite build --config apps/landing/vite.config.ts
bun scripts/build-vercel-output.ts
bun run typecheck
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

**Commit:** `docs(extension): publish privacy and support disclosures`

## PR 5 — Enforce least-privilege page access

**Branch:** `fix/extension-least-privilege`

**Base:** merged PR 4

### Files

- Update `apps/extension/wxt.config.ts` and `apps/extension/tests/config.test.ts`.
- Delete `apps/extension/entrypoints/autoload.content.ts`.
- Update `apps/extension/tests/comment.test.tsx` and `apps/extension/tests/background.test.ts`.
- Update `apps/extension/env.d.ts` and `apps/extension/.env.example` if build-time origin configuration changes.
- Add a built-manifest fixture/assertion only if source-config tests cannot prove the final MV3 output.

### Implement

1. Remove blanket `http://*/*` and `https://*/*` from `host_permissions`.
2. Remove the automatically registered all-pages content script. `comment.tsx` remains an unlisted script injected only by a toolbar-triggered `scripting.executeScript()` call under `activeTab`.
3. Retain only `activeTab`, `scripting`, `storage`, and `identity` permissions.
4. Derive service `host_permissions` from validated build configuration and restrict the production package to `https://crrt.ai/*` plus the exact production Supabase origin.
5. Keep `private.html` as a web-accessible extension resource for HTTP(S) pages because the user-triggered iframe must load there. Use a dynamic resource URL when supported and document that this match pattern grants the page no extension access.
6. On a full page load, require an explicit toolbar activation. Same-document/SPA navigation may retain the injected surface. Cross-origin navigation must never restore it silently.
7. Fail the production build if a service origin is HTTP, localhost, wildcarded, credential-bearing, or outside its expected path/host contract.

### Tests

- The built manifest has no broad page host permission and no content script.
- The only regular-page execution path is a user-triggered action with `activeTab`.
- Install/startup/new tab/full reload changes no page DOM.
- SPA navigation retains one active surface; cross-origin navigation does not.
- Restricted Chrome/Store/file pages fail with actionable UI.
- Production and development origins cannot be mixed into one package.

### Verify

```bash
bunx vitest run apps/extension/tests/config.test.ts apps/extension/tests/background.test.ts apps/extension/tests/comment.test.tsx
bun run typecheck
bun run build:extension
jq -e '(.host_permissions // []) | all(. != "http://*/*" and . != "https://*/*" and . != "<all_urls>")' \
  apps/extension/.output/chrome-mv3/manifest.json
jq -e '(.content_scripts // []) | length == 0' \
  apps/extension/.output/chrome-mv3/manifest.json
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

The `rg` command must return no forbidden host permission or development origin. Review `web_accessible_resources` separately; its page-match eligibility is not a host permission.

**Commit:** `fix(extension): require explicit least-privilege activation`

## PR 6 — Produce a reproducible Chrome Web Store package

**Branch:** `build/extension-store-package`

**Base:** merged PR 5

### Files

- Update `apps/extension/package.json` and `apps/extension/wxt.config.ts`.
- Add generated extension icons under `apps/extension/public/icons/`.
- Add `scripts/generate-extension-assets.ts` and `.test.ts`.
- Add `scripts/build-extension-release.ts` and `.test.ts`.
- Update root `package.json`, `bun.lock`, and `.gitignore`.
- Add `.github/workflows/extension-release.yml`.
- Add a small release metadata schema under `apps/extension/release/`.

### Implement

1. Set the extension package and manifest to `1.0.0`, independent from the npm widget version. Read the manifest version from one source.
2. Generate deterministic 16, 32, 48, and 128 pixel icons from the canonical `branding/design-system-crrt/Frame 11.png`. Preserve pixel rendering and Chrome's Store padding requirement.
3. Build the production MV3 extension from explicit production env input.
4. Validate the built manifest, service origins, permissions, CSP, icon dimensions, version, and web-accessible resources.
5. Recursively scan the built artifact for secrets, service-role identifiers, `.env` contents, test fixtures, localhost/private origins, source maps containing secrets, remotely hosted scripts, `eval`, and dynamic remote imports.
6. Create the ZIP from sorted files with fixed timestamps and normalized permissions so two builds from the same commit and env produce the same SHA-256.
7. Emit `extension-release.json` beside, never inside, the ZIP. It contains commit SHA, extension version, ZIP checksum, manifest checksum, build time, and non-secret production origins.
8. Upload the ZIP and metadata as a GitHub Actions artifact on manual dispatch and on extension-version tags. Never auto-publish to the Store.

### Tests

- Asset generation produces exact dimensions and is unchanged on a second run.
- A fixture containing a secret/dev URL/remote script makes packaging fail.
- File-order or local-mtime changes do not change the ZIP checksum.
- Manifest/package version drift fails.
- The ZIP contains the manifest at its root and excludes source/config/test files.

### Verify

```bash
bunx vitest run scripts/generate-extension-assets.test.ts scripts/build-extension-release.test.ts
bun run typecheck
bun run build:extension:release --verify-reproducible
shasum -a 256 apps/extension/release-dist/crrt-chrome-1.0.0.zip
bun run test:coverage
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

Record both build checksums and require equality.

**Commit:** `build(extension): create reproducible Store package`

## PR 7 — Add the Chrome Web Store listing kit

**Branch:** `docs/extension-store-listing`

**Base:** merged PR 6

### Files

- Add `apps/extension/store-listing/en-US.md`.
- Add `apps/extension/store-listing/permission-justifications.md`.
- Add `apps/extension/store-listing/reviewer-instructions.md`.
- Add `apps/extension/store-listing/assets/promo-440x280.png`.
- Add three to five `1280x800` actual-product screenshots under `apps/extension/store-listing/assets/screenshots/`.
- Add `scripts/validate-extension-store-listing.ts` and `.test.ts`.

### Implement

1. Write title, summary, detailed description, category, single-purpose statement, support/privacy URLs, and permission justifications. Sell reviewed fixes from on-page feedback; do not call CRRT a generic tracker or say “AI-powered.”
2. Explain `activeTab`, `scripting`, `storage`, `identity`, service host access, microphone behavior, and web-accessible iframe resources in plain language matching the manifest.
3. Use only the canonical CRRT icon/wordmark and current UI. Do not reuse the old widget, old landing style, Remotion mock UI, customer data, or invented screens.
4. Capture at least:
   - explicit activation and an on-page pin;
   - the current shared-feedback side pane with destination/audience visible;
   - the dashboard review/external-work continuation;
   - optionally the guest collaboration state and editable provider handoff.
5. Create a restrained 440×280 promo image from canonical branding and real product framing.
6. Provide exact reviewer steps from install through first saved feedback. Keep credentials in the Store console/secret manager, never the repository.
7. Validate image dimensions, required copy fields, live URLs, forbidden placeholders, and agreement with the built manifest.

### Verify

```bash
bunx vitest run scripts/validate-extension-store-listing.test.ts
bun scripts/validate-extension-store-listing.ts
git diff --check origin/trunk...HEAD
```

**Commit:** `docs(extension): add public Store listing kit`

## PR 8 — Gate the complete public-launch story

**Branch:** `test/extension-public-launch`

**Base:** merged PR 7

### Files

- Add `tests/extension-e2e/` with a deterministic local page/API fixture.
- Add `playwright.extension.config.ts` only if the chosen Chrome runner is proven reliable in CI.
- Add `scripts/verify-extension-release.ts` and `.test.ts`.
- Update `.github/workflows/extension-release.yml`.
- Add `docs/runbooks/chrome-extension-release.md`.
- Add `docs/runbooks/chrome-extension-review.md`.
- Add `docs/runbooks/chrome-extension-rollback.md`.
- Add `docs/release-evidence/chrome-extension-1.0.0.md` without credentials or customer data.

### Automate

1. Load the exact release directory in a clean Chrome profile against deterministic local services.
2. Assert no page mutation before toolbar activation.
3. Activate tab A, confirm tab B remains untouched, hide on A, reactivate once, navigate within the SPA, reload, and navigate cross-origin.
4. Verify popup disclosure/session/destination states with mocked authenticated and revoked users.
5. Exercise create/edit/delete for private and project feedback and verify screenshot access stays isolated.
6. Verify manifest, package checksum, listing dimensions, privacy URLs, support URL, and release metadata in one command.
7. Keep real GitHub/Linear/Jira credentials out of CI; provider unit/contract tests remain deterministic.

If a real-extension Chrome runner is unstable in CI, keep the deterministic browser suite as an explicitly run release job with saved artifacts rather than weakening it into DOM-only tests. Document the Chrome version and invocation.

### Manual production matrix

Use two clean Chrome profiles: one project owner/member and one invited guest.

1. Install the exact candidate ZIP and complete disclosure plus hosted auth.
2. Accept the guest invite, open the ordinary product URL, auto-resolve the project, create shared feedback, and verify the owner sees the same item in dashboard and on-page.
3. Verify private and internal feedback never appear to the guest.
4. Verify element, text-range, screenshot, and supported microphone capture.
5. Verify tab isolation, hide/reactivate, SPA route changes, full reload, cross-origin navigation, restricted pages, and uninstall cleanup.
6. Verify npm-widget coexistence without duplicate CRRT surfaces.
7. Connect production GitHub, Linear, and Jira from project settings.
8. From extension-originated feedback, edit and create one item per provider, repeat an uncertain request without duplication, synchronize status, then reject feedback and verify the provider lifecycle result.
9. Disconnect/revoke each provider and verify reconnect/error behavior preserves CRRT feedback.
10. Verify expired session, offline retry, revoked membership, stale anchor, screenshot failure, unsupported microphone, and provider failure copy with request IDs.

### Release operations

1. Confirm the Chrome Web Store developer account has two-step verification, verified contact email, fee paid, and the intended organizational owner.
2. Upload an initial draft to reserve the extension ID before final auth allowlisting.
3. Set `EXTENSION_ALLOWED_IDS` in production, redeploy, rebuild the final candidate, and rerun the matrix.
4. Create a reviewer account and seeded project containing no customer data. Put credentials only in the Store review instructions/secret manager.
5. Upload the final checksum-matched ZIP with Public distribution and deferred publishing.
6. After approval, smoke-test production services once more and explicitly publish.
7. If the staged candidate fails, cancel it. After publication, disable affected server capability when possible and ship a minimal higher-version patch; never broaden permissions silently.

### Verify

```bash
bun run verify:extension:release
bun run typecheck
bun run test:coverage
bun run build
bun run build:dashboard
bunx vite build --config apps/landing/vite.config.ts
bun run build:extension:release
bunx drizzle-kit check
npm audit --omit=dev --audit-level=high
/tmp/dc-venv/bin/diff-cover coverage/lcov.info --compare-branch=origin/trunk
python3 scripts/diff-branch-cov.py origin/trunk
```

**Commit:** `test(extension): gate the public launch story`

## PR body contract

Every implementation PR body must include:

- the user-visible outcome;
- its immediate base and dependency;
- exact scope and explicit non-scope;
- security/privacy impact;
- new migration, environment variable, callback, cron, or Store-console action;
- focused tests, full checks, diff line coverage, and diff branch coverage;
- screenshots for UI changes;
- rollback behavior;
- a checklist item confirming the diff was reviewed against the immediate base.

## Final launch blockers

Do not submit or publish while any item is unresolved:

- production Store extension ID not allowlisted;
- support mailbox or privacy URL unverified;
- reviewer account missing or contains customer data;
- any visible dead control or placeholder;
- any broad page `host_permissions` entry or automatic all-sites content script;
- credentials, development origins, remote code, or non-reproducible ZIP;
- failed two-profile guest collaboration;
- failed GitHub, Linear, or Jira create/link/sync/reject lifecycle;
- Agent control visible to a guest or executable from the extension;
- Store disclosures disagree with manifest or observed data behavior;
- checks or 100% diff line/branch coverage not green.

## Authoritative implementation references

- Chrome Identity API: <https://developer.chrome.com/docs/extensions/reference/api/identity>
- Chrome Web Store publication: <https://developer.chrome.com/docs/webstore/publish/>
- Chrome Web Store user-data policy: <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
- Supabase admin `generateLink`: <https://supabase.com/docs/reference/javascript/auth-admin-generatelink>
- Supabase `verifyOtp`: <https://supabase.com/docs/reference/javascript/auth-verifyotp>
- Vercel Cron management and `CRON_SECRET`: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
