# Widget Agent Premium Workflow — Design Specification

**Date:** 2026-10-02
**Status:** Approved design; ready for implementation planning
**Product:** CRRT npm widget and Agent Bridge

## 1. Summary

CRRT will make Agent a premium, in-widget workflow. A signed-in, authorized user can press `Shift + A`, select actionable feedback, and create a narrowly scoped Agent handoff without leaving the project page. Authentication, project permission, billing entitlement, seat capacity, and selected comment IDs are all enforced by the server before CRRT exposes prompt or share data.

The same widget will support the surrounding feedback lifecycle: accept or reject feedback, hand selected feedback to an agent, observe implementation status, and resolve completed work. The dashboard remains available for project administration and billing, but it is not an intermediate step in the Agent workflow.

The product promise is a calm loop from visual feedback to shipped work:

> Select the feedback. Send it to your agent. Keep shipping where you are.

## 2. Problem

The widget login introduced by PRs 295 and 296 creates a CRRT widget session tied to a user, project, and origin. The existing Agent path does not consume that session. Instead, Agent eligibility still expects the legacy GitHub widget-auth mechanism, and the widget's auth gate links to dashboard login routes. As a result, `Shift + A` can send an already signed-in user to the dashboard instead of opening Agent Bridge in place.

The current Agent Bridge also loads public project and prompt/share data before completing its access check. Comment selection is represented only as client-side prompt text while the underlying share may contain a broader set of comments. That does not provide a sufficiently strong authorization or privacy boundary for private projects or a paid feature.

The element-selection frame also remounts or snaps as the pointer changes target. The interaction feels rigid compared with the soft, continuous selection experience expected from a collaborative shipping tool.

## 3. Goals

- Let an authorized user open Agent Bridge with `Shift + A` without navigating the parent page to the dashboard.
- Resume the exact pending Agent action after an in-widget login completes.
- Make Agent available only when the owning account has an eligible paid subscription.
- Sponsor Agent access for the owner and up to five unique collaborators across all projects owned by that account.
- Require the existing `agent:operate` project capability in addition to the paid entitlement.
- Create a server-side Agent share containing exactly the comments selected by the user.
- Let the widget support individual and batch feedback lifecycle actions around the Agent handoff.
- Make hover/selection movement feel soft and continuous while honoring reduced-motion preferences.
- Preserve the existing dashboard, Agent API contract, and legacy authentication path long enough for a safe migration.

## 4. Non-goals

- Turning the widget into a general project-management dashboard.
- Letting guests operate Agent.
- Giving a widget session access to dashboard APIs or account-wide data.
- Trusting the client to determine project membership, billing status, seat availability, or share scope.
- Automatically modifying code, merging pull requests, or marking human review status on behalf of an agent.
- Replacing CRRT's existing Agent share protocol or agent status model.
- Redesigning the widget launcher or the surrounding customer website.
- Introducing multiple paid tiers in this release. The entitlement model must support future tiers, but the first paid allowance is owner plus five collaborators.

## 5. Product model

### 5.1 Owner-sponsored access

Every project has one owner through `project_members.is_owner`. The owner's `billing_accounts` row is the billing authority for that project. An eligible owner subscription sponsors Agent for:

- the owner;
- project admins with an Agent seat;
- project members with an Agent seat.

Guests never receive `agent:operate`, cannot use Agent, and do not consume an Agent seat.

The initial paid allowance is:

- one owner, which does not consume a collaborator seat;
- five unique admin/member collaborators across every project owned by that owner.

A collaborator who belongs to several projects owned by the same account consumes one seat. Membership under a different owner is evaluated independently against that owner's allowance.

### 5.2 Subscription states

`active` and `trialing` subscriptions grant the premium entitlement. `cancel_at_period_end` does not remove access while the subscription remains active. `free`, `past_due`, `unpaid`, `paused`, `incomplete`, `incomplete_expired`, and `canceled` do not grant Agent access.

The entitlement decision must be derived from server-side billing data. Query parameters, cached client state, or a successful checkout redirect are never sufficient proof of payment.

### 5.3 Seat enforcement

The five-seat cap is enforced when an owner:

- invites or adds an admin/member;
- changes a guest to admin/member;
- accepts or completes an invitation that would create a new unique collaborator.

Removing the collaborator's last admin/member membership under that owner releases the seat. Demoting the collaborator to guest in all of the owner's projects also releases it.

Seat counting is based on distinct user IDs, not membership rows. Concurrent invitations or role changes must serialize or use a database constraint/transactional service boundary so two requests cannot both claim the final seat.

If rollout encounters an existing account above the limit, the owner retains Agent access but collaborators receive `seat_limit_reached` until the team returns to five unique collaborators or upgrades to a future larger plan. CRRT does not silently choose which existing collaborators keep access.

## 6. Authorization model

Creating an Agent session requires every one of these conditions:

1. A valid, unexpired CRRT widget bearer session.
2. Exact match between the session project and requested project.
3. Exact match between the credential origin and the current page origin.
4. Current project membership; revoked membership takes effect immediately.
5. The existing `agent:operate` capability for the current role.
6. An eligible subscription on the project's owner billing account.
7. A collaborator seat when the requester is not the owner.
8. Selected comment IDs that belong to the same project and are eligible for handoff.

The widget session remains narrow: it identifies one user on one project and origin and never becomes a dashboard token. The server resolves membership, capability, project ownership, billing, and seats on every Agent-session creation request.

The new path must reuse `projectCapabilities` and `agent:operate`; it must not duplicate role names in endpoint-specific conditionals.

## 7. Widget interaction flow

### 7.1 Opening Agent Bridge

Pressing `Shift + A` or choosing the visible **Send to agent** action opens the same Agent Bridge. There is one selection-and-send workflow, not separate keyboard and button implementations.

The parent project page remains in place throughout the flow.

### 7.2 Signed-out or expired session

If no valid widget session exists:

1. CRRT records an in-memory pending intent containing the project, page, and requested Agent action. It does not store a share token or prompt.
2. CRRT opens the existing widget-auth popup handoff.
3. The dashboard route acts only as the authentication surface inside that popup; the parent page is never redirected.
4. After a successful exchange, CRRT revalidates the returned widget session and resumes the pending action exactly once.
5. Closing or failing the popup leaves the user on the project page with a retryable inline message.

Pending intent is discarded on project/origin change, logout, explicit cancel, or a second conflicting attempt. Stale popup results must not reopen a bridge for a different page or project.

### 7.3 Authorized paid user

Agent Bridge opens only after the access check succeeds. It displays actionable comments for the current project/page:

- `open` comments that can be accepted as part of the handoff;
- already `accepted` comments that are not completed;
- existing `in_progress` or `ready_for_testing` items as status context, without creating a duplicate handoff by default.

Eligible comments are preselected. The user can select all, select some, or clear the selection. Rejected and completed comments are excluded from the default handoff set.

Confirming the action performs one idempotent server operation:

1. revalidate authorization and entitlement;
2. revalidate every selected comment;
3. transition selected `open` comments to `accepted` as the human user's action;
4. create one selection-scoped share containing exactly the validated selected IDs;
5. return the existing Agent token URL and expiry.

Agents continue to operate only on accepted feedback. The agent does not change `reviewStatus`; the signed-in human's confirmed handoff is the action that accepts open feedback.

### 7.4 Free or ineligible user

Access failures remain inside Agent Bridge and explain the next action:

- owner without an eligible subscription: **Upgrade plan**;
- admin/member on a free project: **Ask the owner to upgrade**;
- collaborator without a seat: **No Agent seats available** and direction to contact the owner;
- guest or role without `agent:operate`: Agent unavailable for this project;
- revoked member or invalid origin: generic project-access denial;
- expired widget session: sign in again through the popup flow.

For an owner, **Upgrade plan** opens the existing checkout/billing flow in a popup or new tab while preserving the bridge state. After CRRT observes an eligible subscription, it reruns the access check and restores the existing selection. A checkout return alone never unlocks the feature.

## 8. In-widget feedback lifecycle

The widget is the operating surface for feedback while work is being shipped.

- A person can accept or reject an open comment individually.
- A person can select multiple actionable comments and accept or reject them in one operation.
- **Send to agent** opens Agent Bridge with the current eligible selection.
- Confirming Agent handoff automatically accepts selected open comments.
- Agent-owned implementation status is shown as `in progress`, `ready for testing`, `done`, or `blocked`.
- Resolving a comment in the widget maps to `implementationStatus = done`.
- Review status and implementation status remain separate: humans own acceptance/rejection; agents own work progress.

The widget must refresh relevant feedback after a batch mutation or Agent event so state changes appear without requiring dashboard navigation or a full page reload. Existing polling/revalidation may be reused; realtime is not required for this release.

## 9. API boundaries

### 9.1 Agent access/session endpoint

Add a widget-authenticated boundary such as:

`POST /api/v1/widget/agent/session`

Request:

```json
{
  "projectKey": "project_public_key",
  "pageUrl": "https://customer.example/path",
  "commentIds": ["comment-id-1", "comment-id-2"],
  "idempotencyKey": "client-generated-proof"
}
```

Authentication uses the existing `Authorization: Bearer crrt_widget_...` credential. The origin continues to come from the validated request `Origin`/`Referer` boundary used by `requireWidgetSession`.

Success returns the existing selection-scoped Agent share contract: share ID, slug, token, token URL, expiry, and validated comment count. The share must contain exactly the validated IDs; the client must not simulate scope by prepending instructions to a broader prompt.

Expected machine-readable failures include:

- `authentication_required`;
- `project_access_denied`;
- `upgrade_required`;
- `owner_upgrade_required`;
- `seat_limit_reached`;
- `invalid_selection`;
- `no_actionable_comments`.

The response may include safe display metadata and an owner-only upgrade URL. It must never expose another user's billing details or a share/prompt token on failure.

### 9.2 Eligibility preflight

Agent Bridge may call a lightweight widget-authenticated eligibility preflight before loading comments. The create-session endpoint must repeat every authorization and entitlement check; preflight is UX, not authority.

The npm widget stops using the legacy GitHub-token `/api/v1/agent/eligibility` path. That route can remain temporarily for older clients, with deprecation telemetry, until supported package versions have migrated.

### 9.3 Transaction and idempotency

Accepting open comments and creating the share must behave atomically from the user's perspective. A retry with the same idempotency key returns the same successful session and does not create duplicate shares, events, or review transitions.

The implementation must use a transactional service boundary compatible with the repository's Supabase runtime-query convention. Any required schema changes originate in `db/schema.ts`, are generated through Drizzle, and remain backwards-compatible.

## 10. Data and entitlement boundaries

The initial release should derive the entitlement from existing sources where practical:

- project owner: `project_members.is_owner`;
- role/capability: existing project capability resolution;
- paid status: owner's `billing_accounts.subscription_status`;
- price identity: `billing_accounts.price_id` mapped through server configuration;
- collaborator count: distinct admin/member user IDs across projects owned by the owner.

Plan allowances belong in a server-side plan catalog keyed by trusted price ID, not in widget code. The first catalog entry grants five collaborator seats and Agent access. Unknown price IDs fail closed.

If durable idempotency or explicit future seat assignment requires new storage, it must be additive, RLS-enabled with no permissive client policy, and accessible only through the service-role API after authorization.

Agent share tokens remain secrets. CRRT must not log raw widget bearer tokens, share tokens, full prompts, or private comment bodies in billing/eligibility telemetry.

## 11. Motion and interaction polish

The hover/selection indicator becomes one persistent visual frame that interpolates from the previous target rectangle to the next. It must not disappear and remount for every candidate.

Approved motion direction:

- movement duration: approximately `250ms`;
- easing: `cubic-bezier(.22, 1.18, .36, 1)` for a restrained friendly spring;
- opacity transition: approximately `120ms`;
- pointer measurements coalesced through `requestAnimationFrame`;
- no state/layout update when the candidate and target rectangle are unchanged;
- correct behavior across nested scroll containers, viewport scrolling, zoom, and responsive reflow;
- no pointer-event interception by the selector overlay;
- `prefers-reduced-motion: reduce` removes interpolation while retaining a visible, immediate focus/selection outline.

Because these values are not present in the current token set, implementation adds named selector-motion tokens to `branding/crrt/tokens.css` and documents them in `branding/CRRT-DESIGN-SYSTEM.md` before use. The change does not alter the launcher, comment composer, or surrounding site layout.

## 12. State and failure handling

- Access state is explicit: `checking`, `authentication_required`, `upgrade_required`, `owner_upgrade_required`, `seat_limit_reached`, `forbidden`, `ready`, or `error`.
- Agent Bridge never flashes private comments or generated prompt data while access is `checking`.
- Network errors preserve the user's current selection and provide retry.
- A membership revocation, subscription change, seat loss, or origin mismatch between preflight and confirmation fails the final create request.
- Invalid or stale selected IDs fail clearly; CRRT never silently broadens the share.
- If some selected comments became completed or rejected, CRRT reports the changed items and asks the user to reconfirm the reduced selection rather than sending a surprising subset.
- Popup-blocked login or billing flows show a user-initiated fallback link without navigating automatically.
- A second `Shift + A` while the bridge is opening focuses the existing bridge; it does not start another request.

## 13. Accessibility

- `Shift + A` is an accelerator, not the only entry point; **Send to agent** is keyboard reachable.
- The bridge traps focus while open, restores focus on close, supports `Escape`, and labels its dialog and selection count.
- Selection rows expose checked state and status without relying on color.
- Authentication, upgrade, seat, and error states are announced through an appropriate live region without repeated announcements.
- Motion reduction is respected as described above.
- Focus outlines use existing CRRT ring tokens and remain visible over customer-page content.

## 14. Verification

### Server and authorization

- Valid widget session, matching project/origin, `agent:operate`, eligible owner plan, and available seat succeeds.
- Anonymous, expired, malformed, wrong-origin, wrong-project, revoked-member, guest, and missing-capability requests fail closed.
- Owner billing is resolved from project ownership; a collaborator's unrelated personal subscription does not unlock another owner's project.
- `active` and `trialing` grant access; every blocked subscription state is covered.
- Distinct collaborator counting handles one person in several projects as one seat.
- Concurrent attempts cannot exceed five unique collaborators.
- Share contents equal the selected validated IDs exactly.
- The endpoint is idempotent across retries and creates no duplicate feedback events.
- No share token, prompt, or private comment body is returned before authorization.

### Widget behavior

- `Shift + A` and **Send to agent** open the same bridge.
- A valid existing widget login never routes the parent page to the dashboard.
- Login success resumes the pending action once; cancel, error, stale result, project change, and origin change do not.
- Owner upgrade, member ask-owner, no-seat, guest, and forbidden states render the correct next action.
- Successful billing reconciliation retries access without losing selection.
- Open comments are accepted by confirmed human action before Agent operates on them.
- Batch lifecycle actions update the widget without a full page reload.

### Motion

- Rapid pointer movement does not create overlapping selectors or excessive renders.
- Selection follows nested scrolling and responsive layout changes.
- The selector never blocks clicking or text selection.
- Reduced-motion mode updates immediately without animated travel.
- Behavior is covered in the supported React 18 and React 19 package test matrix.

Repository requirements still apply: relevant unit/integration tests, typecheck, build, and 100% line and branch diff coverage against `trunk` for implementation changes.

## 15. Rollout and observability

Roll out in compatible slices:

1. Add server-side entitlement and exact-scope Agent-session creation.
2. Add seat enforcement to invitation and role-change boundaries.
3. Move Agent Bridge access checks ahead of all private data loading.
4. Switch the npm widget to widget-session auth and in-place login resume.
5. Add in-widget lifecycle controls and selector motion.
6. Observe supported clients, then retire the legacy GitHub widget-auth path separately.

Track privacy-safe product events such as Agent intent, authentication required/completed, paywall shown, checkout started, entitlement granted, seat limit reached, Agent session created, selection size, and time from feedback selection to `done`. Never include raw tokens or comment contents.

Success is measured primarily by more accepted feedback reaching completed implementation from the widget, with shorter time from pin to shipped fix. Upgrade conversion and seat-limit frequency are supporting signals, not the product's primary outcome.

## 16. Approved decisions

- Agent opens directly inside the widget through `Shift + A` or **Send to agent**.
- Authentication uses the CRRT widget session and popup handoff; the parent page does not detour through the dashboard.
- Authorization requires `agent:operate`, which currently maps to owner, admin, and member roles.
- Agent is premium and sponsored by the project owner's paid plan.
- The initial allowance is owner plus five unique collaborators across the owner's projects.
- Guests neither operate Agent nor consume Agent seats.
- Agent Bridge owns selection and handoff; lifecycle actions remain available in the widget around it.
- Confirming a handoff accepts selected open comments as the human user's action.
- The resulting share contains exactly the selected comment IDs.
- Resolving in the widget maps to implementation status `done`.
- The selector uses the approved friendly-spring direction at approximately 250ms and respects reduced motion.
