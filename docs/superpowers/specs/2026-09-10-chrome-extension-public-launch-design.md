# CRRT Chrome Extension Public Launch

**Date:** 2026-09-10
**Status:** Approved
**Baseline:** `trunk` at `d617a1b` (`#250`)

## 1. Summary

CRRT will publish its existing Chrome extension as a public Chrome Web Store item. The extension is the immediate capture and collaboration surface: a signed-in user activates CRRT on a chosen page, leaves contextual visual feedback, and shares it with an authorized project or keeps it private. The dashboard remains the control plane for review, Agent execution, project administration, and integration configuration.

The launch is not complete when the package merely uploads successfully. It is complete when a new user can discover CRRT in the Store, understand its data access, create or join a project through the hosted onboarding, return authenticated to the extension, leave feedback, and have an internal collaborator turn that feedback into reviewed work. GitHub, Linear, and Jira must pass end-to-end validation before submission.

## 2. Product position and single purpose

The extension's single purpose is:

> Capture contextual visual feedback on a page the user chooses and route it into CRRT's review-to-fix workflow.

The Store listing must sell the outcome—reviewed fixes from on-page feedback—without presenting CRRT as a generic bug tracker, survey tool, or horizontal AI product. Copy must not use “AI-powered.” It must explain that agents draft implementation work and humans decide when it is ready and when it is merged.

GitHub, Linear, and Jira are destinations inside the same feedback-to-fix purpose. They are not separate extension purposes. Product Audit and direct Agent execution are not promoted as extension capabilities in this release.

## 3. Current baseline

The public release builds on functionality already present in `trunk`:

- Chrome MV3 shell, CRRT account login, and isolated extension UI;
- private comments with private screenshots and durable quotas;
- project feedback created from the extension;
- automatic project resolution from allowed domains, with explicit fallback selection;
- feedback-only project guests and invitation acceptance;
- shared/internal visibility enforced by the API;
- unified page feedback from the extension and npm widget;
- editable manual handoff to GitHub, Linear, and Jira;
- provider-neutral external-work persistence, closing, and status synchronization;
- browser speech input when the local browser capability exists;
- activation scoped to the selected tab.

The local memory-only demo previously loaded into Chrome is not a release artifact and must not be submitted to the Store.

## 4. Launch principles

1. **Explicit activation.** CRRT does nothing to a page until the user clicks the extension and starts commenting.
2. **Project membership authorizes; domains only resolve.** A matching URL never grants access.
3. **Capture first, execution second.** The extension captures and collaborates; the dashboard reviews and operates the Agent.
4. **Feedback survives downstream failure.** Tracker or Agent failures never discard the original CRRT comment.
5. **No visible dead ends.** Every visible control must work against production or explain the precise action required.
6. **Least privilege.** The extension requests only the browser and service-origin access required for its current behavior.
7. **One reviewable responsibility per PR.** Release work is split into small PRs and merged sequentially into `trunk`.

## 5. First-run and hosted onboarding

The first-run flow is:

`Install → disclosure → continue → hosted authentication/onboarding → secure handoff → destination → start commenting`

### 5.1 First-run disclosure

Before authentication or page capture, the popup explains:

- CRRT reads the current page URL only when the user opens or activates the extension, in order to resolve a project and identify feedback context;
- page content and screenshots are captured only after an explicit feedback action;
- microphone access is used only after the user presses the microphone control and only when Chrome exposes the required local speech capability;
- project feedback is visible to authorized project collaborators according to its audience;
- private feedback remains visible only to its creator;
- optional tracker handoff occurs only after a signed-in internal collaborator confirms an editable draft.

The disclosure links to the public privacy policy and support page. Acceptance is stored locally with a disclosure-version identifier. A materially changed data practice increments that version and presents the updated disclosure again.

### 5.2 Hosted onboarding

Account creation, invitation acceptance, password recovery, and project creation remain on `crrt.ai`. The popup provides `Sign in` and `Create account` actions that start the same hosted authentication flow. A user with no projects may still choose `Private`; the hosted dashboard is the route for creating or joining a project.

### 5.3 Secure session handoff

The hosted flow returns the authenticated user to the extension without requiring a second login:

1. The extension starts a Chrome identity web-auth flow with a cryptographically random state nonce, a PKCE verifier and SHA-256 challenge, and a Chrome-provided redirect URI. The verifier remains only in extension memory for that attempt.
2. `crrt.ai` authenticates the user and completes any invitation or project onboarding.
3. The server creates a random, single-use handoff code bound to the user, state nonce, PKCE challenge, intended extension identity, and redirect URI.
4. Only the opaque code and state return through the redirect. Access tokens, refresh tokens, passwords, and project credentials never appear in the URL.
5. The extension validates state and exchanges the code plus PKCE verifier over HTTPS.
6. The server atomically consumes the code and returns an extension session. Used, expired, mismatched, or replayed codes fail closed.

Handoff codes live in a dedicated durable table as hashes, expire after two minutes, and are atomically marked consumed on first exchange. Consumed and expired metadata contains no raw code and is deleted after 24 hours. Production accepts only the Chrome Web Store extension identity. Explicit development identities may be configured outside production. The extension session is stored in local extension storage, never synchronized through Chrome Sync.

## 6. Everyday capture flow

After authentication:

- the popup lists only projects the API says the user may access;
- exactly one allowed-domain match selects that project automatically;
- ambiguous or missing matches never guess and show an explicit selector;
- `Private` remains available to signed-in users;
- the selected destination and audience are visible before capture;
- pressing `Start commenting` activates only the current regular HTTP(S) tab;
- Chrome-internal, browser-store, file, and other restricted pages return an actionable explanation;
- the extension remembers a manual destination per hostname only while it remains authorized.

The launcher exposes a small accessible close control on hover and keyboard focus. Closing removes CRRT from that tab and clears its active state. Clicking the extension action activates it again. A newly opened tab is always inactive.

## 7. Sharing a page with a client

CRRT uses the existing project invitation model; it does not introduce anonymous feedback links or URL-based authorization.

The required client flow is:

1. An owner/admin configures the project domain and invites the client as `guest`.
2. The client accepts the invitation through the hosted flow.
3. The client installs CRRT, completes the disclosure, and returns authenticated through the secure handoff.
4. The owner shares the ordinary product page URL.
5. Opening the extension on that domain selects the accessible project.
6. The guest sees shared feedback for that page and creates new shared feedback.
7. The owner sees the same feedback in the dashboard and as on-page pins.

Guest-created project feedback is always shared. Guests cannot see internal feedback, review or implementation controls, Agent actions, repository state, or integration controls. A person who knows the page URL but lacks project membership sees no project feedback. Private comments never become visible to another user unless their owner explicitly moves them into an accessible project.

When the npm widget is already active for the same project, the extension must not render a duplicate overlay. It focuses or cooperates with the existing CRRT surface.

## 8. Agent boundary

The extension does not execute the Agent in this release.

Project feedback enters CRRT as `Open`. An authorized internal member reviews its text, screenshot, anchor, source page, and audience in the dashboard. That person may reject it, complete it manually, send an editable draft to an external tracker, or mark it ready for Agent work. The Agent operates only after the human review boundary and uses the connected repository, approved Design System, and project rules available in the dashboard. Missing context is reported rather than invented.

The extension shows the canonical feedback state (`Open`, `Ready`, `In progress`, or `Done`) when it is returned by the API and provides an `Open in CRRT` action. It does not expose Agent execution controls. Sending work to GitHub, Linear, or Jira does not automatically start the Agent.

## 9. Native integration behavior

GitHub, Linear, and Jira are launch requirements. Each provider must support this production flow for feedback originally captured in the extension:

1. An admin connects the provider from hosted project settings.
2. An authorized internal collaborator opens `Send to…` for saved feedback.
3. CRRT shows an editable provider-specific draft and destination.
4. The collaborator confirms creation.
5. CRRT persists the external identifier and link without exposing provider credentials to the extension.
6. Repeated or uncertain requests recover through the durable idempotency boundary rather than creating duplicates.
7. CRRT displays and synchronizes the linked work status.
8. Rejecting feedback closes or completes the linked external work using the provider's supported lifecycle operation.

Provider failure leaves the CRRT feedback intact and preserves the draft for retry. Expired credentials produce a reconnect action. Insufficient provider permissions identify the affected connection and destination. A disconnected or unconfigured provider never appears as a working destination.

Guests cannot connect providers or send external work.

## 10. Permissions and data boundaries

The release removes blanket `http://*/*` and `https://*/*` page access.

The target permission model is:

- `activeTab` for the page explicitly chosen by the user;
- `scripting` for user-triggered injection;
- `storage` for local session, consent version, activation, and authorized destination preferences;
- `identity` for the hosted secure authentication handoff;
- host access restricted to `https://crrt.ai/*` and the configured production Supabase origin rather than all HTTP(S) pages.

CRRT is inactive on install, browser startup, and new tabs. It survives same-document and SPA navigation while active. A same-origin reload may restore the surface only while Chrome retains the `activeTab` grant. Cross-origin navigation requires explicit reactivation; the extension does not regain access silently. The release does not run an always-on content script across every visited site merely to discover activation state.

The privacy inventory includes:

- account email and authentication/session information;
- current page URL, hostname, normalized page identity, and selected project;
- user-authored feedback and visibility;
- explicitly captured page selection, anchor, viewport geometry, and screenshot;
- explicitly initiated speech input processed through the browser capability;
- linked external-work identifiers and status.

The public privacy policy and Chrome Web Store Privacy Practices answers must match this inventory exactly. Data is transmitted only over HTTPS. Provider secrets and service-role credentials remain server-side. Screenshots remain private and use short-lived signed delivery URLs. Page scripts cannot inspect extension session data, private comment text, or protected images inside the isolated extension frame.

## 11. Error and recovery behavior

- **No session:** start hosted sign-in; do not mount feedback UI.
- **Expired session:** preserve unsent local draft, reauthenticate, and resume.
- **No accessible project:** offer `Private` and hosted project onboarding.
- **Ambiguous domain:** require explicit destination selection.
- **Revoked membership:** clear the project selection and all project data on the next request.
- **Restricted page:** explain that Chrome does not allow activation there.
- **Offline or API failure:** preserve the draft and show retry; do not imply successful submission.
- **Screenshot failure:** keep written feedback and clearly identify the missing screenshot before confirmation.
- **Unsupported microphone:** omit the microphone control without blocking text feedback.
- **Tracker failure:** keep feedback and external-work recovery state; never create a blind duplicate.
- **Stale anchor:** keep the feedback in the side pane and avoid placing a misleading pin.
- **Hide action:** remove the overlay from only the current tab and allow explicit reactivation.

Every server failure returned to the extension includes a safe user message and a request identifier suitable for support. Logs must not contain passwords, session tokens, OAuth secrets, full private screenshots, or raw handoff codes.

## 12. Release implementation boundaries

Implementation is divided into eight small review units. PRs should branch from current `trunk`; stacking is used only where a real code dependency makes it unavoidable.

### PR 1 — Launcher lifecycle

- cleanly rebase and finish existing PR `#236`;
- add the accessible close control;
- deactivate and reactivate only the current tab;
- cover navigation, duplicate-mount, close, and reactivation paths.

### PR 2 — Secure hosted authentication handoff

- add server-side single-use handoff creation and atomic exchange;
- add Chrome identity flow, PKCE, state validation, expiry, replay prevention, and production extension allowlisting;
- support signup, sign-in, invitation acceptance, and sign-out without placing credentials in URLs;
- add the durable hashed-code table through `db/schema.ts` and a generated backwards-compatible migration;
- delete consumed and expired handoff metadata after 24 hours.

### PR 3 — Public first-run and onboarding states

- add disclosure-version state and hosted onboarding entry points;
- handle no-session, no-project, expired-session, restricted-page, and recovery states;
- preserve the existing project/private destination behavior.

### PR 4 — Public privacy and disclosures

- publish the CRRT privacy and support pages;
- make Store and in-product disclosures match actual data handling;
- document retention, deletion, support access, third-party handoff, and Limited Use commitments;
- version the Chrome Web Store Privacy Practices answers beside the product copy.

### PR 5 — Least-privilege permissions

- replace blanket host permissions and always-on page injection with the target permission model;
- document every retained permission and its user-facing purpose.

### PR 6 — Release packaging

- set extension version `1.0.0` independently from the npm package version;
- generate correctly sized 16, 32, 48, and 128 pixel icons from the canonical CRRT asset, with the 128 pixel Store icon following Chrome padding guidance;
- validate production URLs and publishable configuration at build time;
- produce a deterministic Chrome MV3 ZIP and CI artifact;
- fail release packaging if secrets, development URLs, source-only test data, or forbidden remote code are present.

### PR 7 — Store listing kit

- version listing title, summary, detailed description, category, single-purpose statement, permission justifications, privacy answers, support details, and reviewer instructions in the repository;
- add one required 440×280 promotional image and three to five actual-product screenshots at 1280×800;

### PR 8 — Public-launch verification

- automate the stable checks that can run without third-party reviewer accounts;
- document and execute the manual Chrome/profile/provider matrix;
- record final evidence for fresh install, onboarding, guest collaboration, privacy boundaries, and all three providers;
- provide a safe reviewer account and seeded project through an operational runbook, never through committed credentials;
- add the repeatable release and rollback runbook.

## 13. Verification matrix

### 13.1 Automated gates

Every PR must pass:

- TypeScript checks;
- React 18 and React 19 suites;
- extension, dashboard, landing, and package builds relevant to its diff;
- secret scanning and dependency audit;
- Drizzle snapshot consistency when schema changes;
- 100% changed-line and changed-branch coverage against the exact PR base;
- manifest validation and release ZIP inspection for packaging changes.

### 13.2 Manual clean-profile gates

Test the final candidate in current stable Chrome using a new browser profile:

- install from the exact candidate ZIP;
- complete disclosure, signup/sign-in, secure handoff, logout, and reauthentication, including rejected state, PKCE, expiry, and replay cases;
- accept a guest invitation, open a shared page, create feedback, and verify owner visibility in dashboard and on-page;
- create, edit, move, and delete private and project feedback;
- confirm internal feedback never appears to a guest;
- capture an element, text range, screenshot, and microphone comment;
- activate one tab, verify other tabs remain untouched, hide, navigate, and reactivate;
- verify npm-widget coexistence without duplicate UI;
- connect and disconnect GitHub, Linear, and Jira;
- create one editable external item per provider from extension-originated feedback;
- repeat an uncertain request without duplication;
- verify linked status synchronization and reject-to-close behavior;
- test offline, expired session, revoked membership, restricted page, unsupported microphone, and provider error states;
- uninstall and confirm no UI or page modification remains.

The reviewer account contains no customer data, has an explicit test project, and includes enough instructions to exercise the single purpose without internal assistance.

## 14. Chrome Web Store release

The publisher is owned by a CRRT/The Design Project Google account with two-step verification, a verified monitored contact email, and shared organizational access where supported. The item uses Public distribution.

An initial draft upload reserves the production extension identity before final secure-handoff testing. Final submission uses deferred publishing: Google reviews the public item, the team performs one smoke test against the approved candidate and production services, and an owner explicitly publishes within the allowed staging window. Deferred publishing does not change the Public distribution target.

The launch owner verifies:

- package version and checksum;
- production CRRT, Supabase, GitHub, Linear, and Jira configuration;
- public privacy and support URLs;
- listing and privacy answers against the shipped manifest;
- reviewer credentials and instructions;
- current CI and production deployment health.

If a critical issue is found before publication, the staged release is cancelled and replaced. If a critical issue is found after publication, the team disables the affected server-side capability when possible, communicates the impact through support, prepares a minimal higher-version patch, and submits it immediately. Extension updates never silently broaden permissions or data use.

## 15. Success criteria

The launch is successful when:

- a new user can move from Store installation to first saved feedback without manual support;
- an invited guest can leave shared feedback on an ordinary page and the owner can see the same pin in dashboard and on-page;
- no page is modified before explicit activation and no unrelated tab is activated;
- GitHub, Linear, and Jira each complete the creation, link, synchronization, and reject lifecycle without duplicates;
- Agent execution remains human-authorized and dashboard-only;
- Store disclosures, privacy policy, manifest permissions, and observed data behavior agree;
- the submitted ZIP is reproducible, secret-free, production-configured, and traceable to a green commit;
- support can identify a failed request without receiving private credentials or screenshots in logs.

Product metrics after launch are first-session activation, time from install to first project feedback, time from pin to reviewed fix, fixes shipped per active user per week, and week-four retention. The extension does not add unrelated tracking solely to measure these metrics.

## 16. Explicitly out of scope

- anonymous access to project feedback;
- public feedback links that bypass project membership;
- Agent execution inside the extension;
- automatic tracker creation without editable human confirmation;
- generic webhook, Zapier, or arbitrary provider frameworks;
- support for browsers other than Chrome in the first public release;
- user research, surveys, voting, or community feedback boards;
- background browsing-history collection;
- Store monetization or in-extension payments;
- redesigning the dashboard, npm widget, or landing page outside the minimum onboarding, privacy, support, and status surfaces required for this launch.
