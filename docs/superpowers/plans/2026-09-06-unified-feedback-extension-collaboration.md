# Unified Feedback and Extension Collaboration — Implementation Plan

**Design:** `docs/superpowers/specs/2026-09-06-unified-feedback-extension-collaboration-design.md`

## Delivery strategy

Ship eight stacked, independently testable PRs. Every branch is based on the previous branch until merged. Each PR must pass type checking, focused tests, the complete Vitest suite, production builds, and `npm audit` before review.

The first five PRs deliver client collaboration without requiring an external provider. The final three expose the existing GitHub handoff through a shared provider boundary, then add Linear and Jira independently.

## PR 1 — Share extension feedback with a CRRT project

**Branch:** `feat/extension-project-feedback`

Deliver a complete manual path: a signed-in extension user selects an accessible project, creates a pin, and sees the same comment in the project dashboard and Agent-ready workflow.

Implementation:

1. Expand the comments constraint so authenticated extension comments may carry a project key while personal comments remain nullable.
2. Extend extension serialization with project identity and source without weakening screenshot ownership.
3. Accept an optional project key on create after server-side membership and allowed-domain validation.
4. Return accessible projects to the extension through the existing authenticated projects API.
5. Add a simple project/private selector to the extension experience and persist the active choice locally.
6. Reuse the project comments feed and dashboard presentation; do not copy or mirror comments.
7. Verify personal create/edit/delete behavior remains unchanged and project feedback is visible through existing project APIs.

Acceptance:

- A member can select a project, create an extension pin, and see it in that project's dashboard.
- A forged inaccessible project key is rejected.
- Personal mode still creates an owned comment with no project.
- Project extension feedback can be marked Ready for Agent from the dashboard.

## PR 2 — Resolve projects by domain and promote private feedback

**Branch:** `feat/extension-project-resolution`

Make project context automatic when certain and editable when not.

Implementation:

1. Normalize current hostnames and match only against projects accessible to the signed-in user.
2. Preselect a unique match, remember valid user choices per hostname, and require selection for ambiguous matches.
3. Add an authenticated promotion endpoint that assigns an owned private extension comment to an accessible project in place.
4. Preserve comment ID, screenshot path, author, anchor, and timestamps during promotion.
5. Invalidate remembered mappings after membership/domain changes.

Acceptance:

- A unique domain match selects the project without another click.
- Ambiguous and missing matches never guess a project.
- Promoting a personal comment changes the existing record rather than creating a duplicate.

## PR 3 — Invite clients as project guests

**Branch:** `feat/project-guests`

Add a minimal client role that can collaborate without receiving execution authority.

Implementation:

1. Expand membership and invitation roles with `guest` through a safe migration.
2. Add project-specific invite acceptance and magic-link continuation.
3. Include role/capabilities in authenticated project responses.
4. Centralize project capability checks so APIs distinguish guest reads/writes from internal review, Agent, settings, and integration actions.
5. Update member/invite management UI and email copy for the guest role.

Acceptance:

- An admin invites a guest, the guest signs in by magic link, accepts, and sees the project in the extension.
- A guest can create project feedback but cannot change review state, run the Agent, manage settings, or create external work through direct API calls.
- Revocation removes access on the next request.

## PR 4 — Separate Shared and Internal feedback

**Branch:** `feat/feedback-visibility`

Allow client collaboration and internal team discussion in the same project without leaking internal data.

Implementation:

1. Add `shared`/`internal` visibility with safe defaults for existing and public widget feedback.
2. Force guest-created project feedback to shared and expose a visible audience selector to internal users.
3. Apply visibility at every project query boundary, including details, counts, search, notifications, screenshots, and share/Agent inputs.
4. Let internal users change visibility while preventing guests from discovering internal records or metadata.
5. Add dashboard and extension indicators.

Acceptance:

- Guests see all shared project pins and none of the internal records or derived metadata.
- Members see both audiences and can choose one when posting.
- Existing widget feedback remains shared after migration.

## PR 5 — Render collaborative project pins in the extension

**Branch:** `feat/extension-project-pins`

Make the extension a full no-code collaboration surface over any registered site.

Implementation:

1. Introduce normalized page identity with same-origin canonical URL support and tracking-parameter removal.
2. Load authorized project comments for the current page into the shared feedback widget.
3. Add `This page` and `All project feedback` views to the side pane.
4. Detect SPA route changes and refresh immediately; use bounded refresh while the pane is open.
5. Resolve text/element anchors first and coordinates second. Show unresolved feedback in the pane without placing a false pin.
6. Detect an existing embedded CRRT widget for the same project and focus it instead of rendering duplicate controls.

Acceptance:

- A guest drops a pin and a member opening the same route sees it on-page and in the dashboard.
- Navigation swaps to the correct page pins without a reload.
- Broken anchors remain accessible but are not rendered in the wrong location.
- Widget and extension do not produce duplicate overlays.

## PR 6 — Expose GitHub through a shared handoff service

**Branch:** `feat/shared-tracker-handoff`

Turn the existing GitHub issue flow into the first implementation of a provider-neutral manual handoff available from dashboard and extension.

Implementation:

1. Expand persistence with a child external-work collection while bridging existing GitHub issue fields.
2. Define server-side provider contracts for connection status, destinations, assignees, editable drafts, creation, and recovery.
3. Move the current GitHub creation/idempotency behavior behind that contract.
4. Add a shared `Send to...` draft experience to dashboard and extension for internal users.
5. Mark open feedback Ready only after confirmed creation; preserve state on failure and recover indeterminate results before retry.
6. Keep provider credentials and installation identifiers out of extension responses and storage.

Acceptance:

- An internal member edits a GitHub issue draft and sends it from either surface.
- Guests cannot discover or invoke handoff APIs.
- Repeated or timed-out requests do not create duplicate issues.
- Existing GitHub repository connections continue to work.

## PR 7 — Add native Linear handoff

**Branch:** `feat/linear-handoff`

Implement Linear as a native provider using the shared service.

Implementation:

1. Add admin-only OAuth connection/disconnection and secure server-side token storage.
2. Discover accessible teams/projects, assignees, labels, and priorities through a bounded provider adapter.
3. Map the shared editable draft to Linear issue creation.
4. Persist the external identifier and URL, and apply the shared idempotency/recovery semantics.
5. Expose connection state and `Send to Linear` in dashboard and extension.

Acceptance:

- An admin connects Linear and a member creates an assigned issue from feedback.
- Cancellation or provider failure leaves the CRRT feedback unchanged.
- No Linear credential reaches a browser bundle or API payload.

## PR 8 — Add native Jira handoff

**Branch:** `feat/jira-handoff`

Implement Jira Cloud as a native provider using the shared service.

Implementation:

1. Add admin-only OAuth connection/disconnection and secure server-side token storage.
2. Discover accessible sites, projects, issue types, assignees, labels, and priorities through a bounded provider adapter.
3. Map the shared editable draft to Jira issue creation while omitting unsupported fields explicitly.
4. Persist the external identifier and URL, and apply the shared idempotency/recovery semantics.
5. Expose connection state and `Send to Jira` in dashboard and extension.

Acceptance:

- An admin connects Jira Cloud and a member creates an assigned issue from feedback.
- Cancellation or provider failure leaves the CRRT feedback unchanged.
- No Jira credential reaches a browser bundle or API payload.

## Stack verification and merge order

Merge strictly in numeric order. PRs 2 and 3 are conceptually parallel but remain stacked for predictable review. PRs 7 and 8 depend only on PR 6; they may be reviewed independently after their base is merged.

For each PR:

1. Run focused tests for changed behavior.
2. Run the complete repository check/test pipeline.
3. Build the npm widget, dashboard, landing, and extension packages affected by the stack.
4. Run dependency and secret scans.
5. Inspect the final diff against its immediate base, not only against `trunk`.
6. Document any required migration, OAuth callback URL, environment variable, or provider-console action in the PR body.

Before releasing the extension, manually verify the complete two-user story with one guest Chrome profile and one internal-member profile.
