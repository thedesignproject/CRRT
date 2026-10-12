# Dashboard Inbox and Bulk Workflow Design

**Date:** 2026-10-12  
**Status:** Approved  
**Scope:** Dashboard only; extension capture and the widget Agent protocol remain unchanged.

## Outcome

Turn unassigned private extension feedback into a first-class shipping queue:

1. Capture feedback privately from the extension.
2. Find it in **Inbox**.
3. Select a page or explicitly select the entire Inbox.
4. Move the exact selection into a project.
5. Continue with the same selection in that project.
6. Mark the selection Ready and send it to Agent without selecting it again.

The UI must make bulk mode obvious without adding permanent chrome. Selection is represented by checkboxes, a quiet row tint, and a compact floating action bar. Status is represented by badges, never decorative colored rails.

## Product semantics

- **Inbox** replaces the label **My Comments** everywhere in the dashboard.
- Inbox means feedback captured by the signed-in user through the extension that has no project yet (`source = extension`, owned by the user, `project_id IS NULL`). It is private to that user.
- Inbox is a staging queue, not a project. Agent, review status, implementation status, and collaboration remain project-scoped.
- Moving an Inbox item is the boundary that gives it project membership, project authorization, review workflow, and Agent eligibility.
- Existing per-comment edit, delete, and move actions remain available outside bulk mode.

## Interaction model

### Entering and leaving bulk mode

- `Select` enters bulk mode. Rows switch from avatars to checkboxes.
- Clicking a row toggles its checkbox; it does not open detail while bulk mode is active.
- `Escape`, the close button in the floating bar, changing project/view, logout, or losing authorization clears selection and exits bulk mode.
- Selection never leaks from one project or user session into another.

### Selecting across pages

Use the familiar Gmail two-step pattern:

1. `Select all` selects every visible item in the current page or filtered project list.
2. When more matching items exist, a notice offers `Select all N items in Inbox` (or the current project filter).
3. Accepting that offer changes selection to the server-backed matching set. The floating bar always shows the real selected total.
4. Deselecting an item after selecting all records it as an exclusion. Selecting it again removes the exclusion.
5. `Clear selection` returns to zero selected items without leaving bulk mode.

The selection descriptor is one of:

```ts
type BulkSelection =
  | { mode: 'ids'; ids: string[] }
  | { mode: 'all'; excludedIds: string[] }
```

The server resolves `mode: all` against the authenticated user's current Inbox at execution time. It never trusts a client-provided total or user id.

### Inbox floating bar

The bar appears only when at least one item is selected. It is centered above the bottom edge of the content area, sized to its contents, and does not span the viewport.

```text
              [ 21 selected | Move to project... | Actions | x ]
```

- Primary action: `Move to project…`.
- Secondary menu: `Delete selected`.
- Destructive bulk delete requires confirmation containing the selected count.
- If the user has no eligible destination project, the move control explains that a project must be created or access granted; it does not submit.
- Destination choices include only projects where the user can create feedback.
- While an operation is running, duplicate submission is disabled and the bar shows progress.

### Move continuation

After a successful bulk move:

- Open the destination project automatically.
- Enter bulk mode there.
- Preserve only the ids the server confirms were moved.
- Keep the moved selection even if the comments span multiple URLs.
- If some comments were skipped because another tab moved or deleted them, report the exact moved/skipped counts and preserve only the moved ids.
- If no comments moved, remain in Inbox with the selection intact.

### Project floating bar

Replace the current small inline bulk toolbar with the shared floating bar:

```text
        [ 5 selected | Mark ready | Send to Agent | Actions | x ]
```

- `Mark ready` accepts the selected feedback for Agent.
- `Send to Agent` is enabled only when every selected item is accepted and otherwise eligible.
- With mixed readiness, never silently omit items. Disable Agent and show `3 of 5 ready`, with `Mark all ready` as the recovery action.
- A successful Ready action preserves selection so the next action can be Send to Agent.
- Done and Reject finish the operation and exit bulk mode.
- The secondary menu contains Done and Reject; destructive or state-reversing actions are not visually equal to the primary path.
- A single Agent handoff may include selected comments from multiple URLs within the same project. The prompt groups them by page URL and preserves each item's screenshot and target context.
- Agent entitlement, role, collaborator-seat, and project-membership checks remain server-authoritative. Upgrade and seat-limit states reuse the existing Agent UX.

## Bulk API

Add an authenticated endpoint for Inbox operations:

```text
POST /v1/extension/comments/bulk
```

Move request:

```json
{
  "operation": "assign",
  "selection": { "mode": "ids", "ids": ["..."] },
  "projectId": "project-key"
}
```

Delete request:

```json
{
  "operation": "delete",
  "selection": { "mode": "all", "excludedIds": [] }
}
```

Response:

```json
{
  "processedIds": ["..."],
  "skipped": [{ "id": "...", "reason": "not_in_inbox" }],
  "selectedTotal": 21
}
```

Rules:

- Require an authenticated user for every operation.
- Resolve only owned, unassigned extension comments. Never operate on another user's item or an item already in a project.
- For assignment, require `feedback:create` on the destination project and coerce visibility with the existing project-role policy.
- Deduplicate and validate explicit ids; reject malformed or excessive payloads.
- Resolve `all` server-side and return the authoritative total.
- Assignment is one database update over the resolved owned set; rows changed by another tab are returned as skipped rather than silently disappearing.
- Deletion removes private screenshots before deleting rows. Per-item storage failures remain retryable and are returned as skipped; successful items are not rolled back.
- Return a structured result for partial success. The client reconciles from the response and then refreshes.
- Keep the existing single-item endpoints for backwards compatibility.
- No schema migration is required.

## Visual direction

The dashboard exception in the CRRT design system remains authoritative: Figtree, white/neutral surfaces, and orange only for meaningful actions and focus.

### Compact token plan

- **Base:** existing dashboard background, card, border, foreground, and muted tokens.
- **Selection:** existing neutral accent surface plus the standard focus ring; no new raw colors.
- **Primary action:** existing dashboard primary token with primary foreground.
- **Destructive:** existing destructive/status token, confined to the destructive menu item and confirmation.
- **Type:** existing dashboard Figtree roles; counts and labels remain sentence case.
- **Elevation:** existing small/pill shadow token for the floating bar.
- **Motion:** existing fast/default durations; opacity and a short vertical translation only. Reduced-motion users get an immediate state change.

### Row states

- Remove the orange left active border.
- Remove the colored right status rail.
- Remove the orange border from the old inline bulk toolbar by removing that toolbar.
- Default: neutral surface with the existing horizontal divider.
- Hover: subtle neutral surface.
- Active single item: neutral accent fill with a visible keyboard focus treatment.
- Bulk selected: filled checkbox plus a restrained neutral tint.
- Inactive/done: muted text and surface, still readable.
- Status remains legible through the existing status badge.

### Floating bar behavior

- `position: fixed` within the dashboard shell's visual viewport, horizontally centered over the main workspace rather than the entire window/sidebar.
- Use content width with a safe maximum; wrap deliberately on narrow screens and become a bottom sheet only when controls cannot fit.
- Reserve bottom padding in scrollable lists while visible so the final row is never obscured.
- Respect safe-area insets.
- Sit above list content and below dialogs/popovers.
- Preserve visible focus, tab order, accessible names, live count/status announcements, and Escape handling.

## Error and concurrency behavior

- Empty selection: actions disabled; no request is sent.
- Stale selection: refresh, report moved/deleted versus skipped, and keep actionable failures selected.
- Destination access revoked: remain in Inbox, preserve selection, and show the permission error.
- Agent entitlement/seat lost after selection: preserve selection and show the existing upgrade/seat state.
- Ready request partially fails: refresh authoritative item states, preserve selection, and identify failures; Agent stays disabled until every selected item is ready.
- Network retry: bulk operations are idempotent from the user's perspective. Already moved/deleted ids return as skipped/not-in-Inbox rather than mutating unrelated rows.
- Pagination shrink after deletion/move: clamp to the last available page.
- Signed screenshot refresh must not clear selection or pending destination.
- Opening a detail from outside bulk mode retains current behavior.

## Approaches considered

### A. One large dashboard PR

Fastest to demo, but couples API, navigation, Agent state, and visual changes. Review and rollback risk are high.

### B. Client-side loops over existing single-item endpoints

Avoids backend work, but `Select all Inbox` requires loading every page, creates N requests, makes partial failures hard to explain, and is fragile under concurrent changes.

### C. Stacked contract-to-UI rollout — selected

Introduce the bulk contract first, then Inbox, project workflow, and visual cleanup. Each layer is independently testable, backward-compatible, and reviewable. This is the safest path and avoids mixing product semantics with polish.

## Delivery plan

1. **Bulk Inbox API** — selection parser, authenticated assign/delete operations, structured partial results, API client, and tests.
2. **Inbox workflow** — rename My Comments, page/all selection model, floating move/delete bar, and post-move navigation with exact selection handoff.
3. **Project bulk + Agent** — shared floating bar in projects, Ready selection persistence, mixed-state guard, exact selected Agent handoff, and multi-page grouping.
4. **Visual and accessibility polish** — remove colored rails, normalize row states/scrollbars, responsive bar behavior, keyboard/focus/reduced-motion coverage.

Each PR is stacked on the one before it and must pass typecheck, relevant tests, the full test suite, and 100% line and branch diff coverage against its immediate base.

## Acceptance criteria

- The dashboard contains no user-facing `My Comments` label; it says `Inbox`.
- Inbox contains only the current user's unassigned extension feedback.
- Users can select the visible page and explicitly expand selection to all matching Inbox items.
- Bulk move and confirmed bulk delete work with clear partial-failure reporting.
- A successful move opens the destination project with the exact moved selection active.
- Project Ready preserves selection; Done and Reject clear it.
- Agent never silently drops selected comments and accepts a multi-URL selection from one project.
- Existing entitlement, role, seat, and project security checks remain enforced.
- The old inline bulk toolbar and orange vertical row/status rails are gone.
- The floating bar is compact, responsive, keyboard-accessible, and does not hide list content.
- Tests cover permissions, all-selection exclusions, stale/concurrent changes, partial failures, pagination, selection lifecycle, mixed Agent readiness, and accessibility behavior.
