# CRRT click audit

Goal: every repeatable interaction takes at most two clicks; undo never costs more than doing. No silent state changes. Public APIs remain compatible.

Count starts on the relevant surface with the task's items visible; navigation to that surface is audited separately. N means selected items. Text entry is not a click. Frequency weights (1–5) are estimates from the workflow, not telemetry; priority = clicks saved × frequency. This is an initial inventory, not an exhaustive completion claim.

| Task / evidence | Clicks before | Target / after | Frequency | Priority (N=10) | Status |
| --- | --- | --- | --- | --- | --- |
| Dashboard: resolve visible list (App + CommentList) | Select → Select all → Actions → Mark done = 4 | Select all → Mark done = 2 | 5 | 10 | Implemented in first layer |
| Dashboard: reopen done/accepted/rejected list (App) | Open each item and change state: at least 2N | Select all → Reopen = 2 | 4 | 72 | Implemented in first layer |
| Undo dashboard Mark ready | At least 2N | Undo mark ready = 1 | 4 | 76 | Third layer; other bulk states remain pending |
| Widget handoff accepts open comments (PremiumAgentBridge.confirmHandoff) | Send to agent mutates selection before prompt copy | Explicit approval copy + reversible action | 5 | TBD | Audit server mutation and undo semantics |
| Copy existing prompt (useAgentSession.copyPrompt / AgentBridgeModal) | 1; no done mutation found on current trunk | 1, no status change | 5 | 0 | Code inspected; verify in browser |
| Dashboard select arbitrary N items | Enter select mode + N clicks + action | N checkbox clicks + action; contiguous range: first + Shift-last + action | 5 | 5 (arbitrary), 45 (range) | Direct checkboxes and range implemented; arbitrary selection inherently depends on N |
| Inbox select all + move to a project | Select → Select page → Select all matching → destination → Move = 5+ | Select all → Move to [project] = 2 | 4 | ≥12 | Merged #375/#377; Undo move pending |
| Bulk Reject (App) | Originally 4; parent layer Select all → Actions → Reject = 3 | Select all → Reject = 2 | 3 | 3 vs parent | Implemented in second layer |
| Project/filter/navigation/settings/export/audits/integrations | Not yet measured | ≤2 each | TBD | TBD | Inventory pending |

## First layer design and evidence

Expose existing Select all outside selection mode, entering selection mode as part of that action. Put Mark done and Reopen directly in the selection toolbar. Reopen restores open/unassigned and clears the stale agent claim, using existing authorized endpoints. Keep selection limits, project generation guards, error reporting, and failed-item retry selection. No new endpoint or public prop.

Tests exercise done, accepted, and rejected batches, two-click selection/action from the current list, partial failure/retry, and direct Select all visibility. Undo toast is a separate micro PR; the overall objective remains incomplete.

## Product decisions

- Keep irreversible delete confirmation until a compatible restore mechanism exists; count and record it rather than silently weakening deletion safeguards.
- Do not cancel an agent's active implementation merely to undo copying a prompt. Inspect claim/permission semantics before changing this flow.

## Second layer: direct bulk Reject

Replace the one-item Actions menu with the existing Reject button. The review endpoint, busy state, permissions, and partial-failure selection stay intact. Test the two-click path and verify implementation status is untouched; existing rejection failure/stale-project tests exercise the same direct control.

Undo investigation: the implementation-status endpoint clears `claimedByAgentId` on `unassigned` and cannot restore a released claim. Exact undo for claimed items needs an explicit decision about restoring agent ownership and a concurrency-safe restore contract. This remains unresolved, not counted as complete. Undo of unclaimed/review-only batches remains actionable in a following layer.

## Third layer: undo bulk approval

Capture the previous review statuses for successfully approved items and offer a persistent one-click Undo. Failed restores remain available for retry; already-accepted and failed approvals are excluded. Undo never writes implementation status or agent ownership. Project/navigation changes, later local status actions, and starting a handoff discard the old snapshot. Refuse restores when the currently loaded review, implementation, or claim differs from the expected state.

Remaining: server-side compare-and-set is needed to close the race with another reviewer/agent after the loaded-state check. Reject also asynchronously closes linked GitHub/Linear/Jira tickets (`review-status.ts` → `closeLinkedExternalWork`); restoring its review status alone is not full undo. Record both as incomplete instead of promising a generic reversible action.

## Fourth layer: select Inbox scope directly

Expose Select page and Select all N in Inbox before selection mode. Both enter selection mode automatically, clear the individual editor, and preserve the existing server-side all/exclusions descriptor, permission checks and busy guards. Whole-Inbox selection falls from 3 clicks to 1; selecting only the visible page falls from 2 to 1. Moving still requires destination selection plus Move; this is the next separate click problem. Permanent deletion still requires confirmation pending a reversible-delete contract.

Browser verification at 1440px and 390px confirms one-click all-pages selection survives pagination. Remove project-only bulk scroll padding from Inbox so the Next/Previous controls remain clickable on mobile.

## Fifth layer: move selected Inbox items directly

Replace the destination dropdown plus Move button with explicit Move to [project] buttons for eligible destinations. Whole-Inbox move becomes Select all → Move to [project] = 2 clicks; no default destination or implicit move on dropdown change. Destinations remain keyboard reachable in a horizontally scrollable group, and all are disabled while moving. Existing skipped-item, error, account-switch and destination-handoff logic stays in place. Reverse movement back to Inbox still needs a compatible API and remains pending.

## Sixth layer: atomic version prerequisite for Undo

Add an optional expectedUpdatedAt to the internal actor-bound mutation, checked inside its existing database row lock before any change. Two concurrent callers using the same version produce one success and one status_conflict; the losing write leaves the winner intact. Legacy calls and permissions remain unchanged. This layer does not reduce a UI click by itself: it is the compatibility-preserving prerequisite for safe one-click Undo. Endpoint and dashboard wiring are the next layer. Verified on a disposable local Postgres after applying the full migration chain.

## Seventh layer: use the atomic fence in Undo

Mark ready snapshots now retain the exact server-returned updatedAt (including sub-millisecond precision). Undo supplies that version through the existing review endpoint; malformed versions return 400, stale versions return 409 and discard the conflicting undo entry with an explicit explanation. Missing server versions never enable unfenced Undo. The database check from #378 closes the cross-tab/reviewer/agent race for approval Undo without adding clicks or changing legacy requests.

## Next stack: atomic completion before Undo

After merging #367–#379, start from trunk including reviewer fixes for pending writes and stale Undo. Mark done and Reopen still issue separate review/implementation requests, allowing half-applied changes. Extend the existing review endpoint with an optional implementationStatus requiring expectedUpdatedAt, and write both fields through one version-fenced mutation. Preserve existing review-only clients and claim clearing for unassigned. This prerequisite does not change clicks; it enables exact one-click Undo of completion in the next layer. Reopening previously claimed work and reversing external ticket closure remain unresolved.

## Ninth layer: Undo Mark done

Mark done now writes review and implementation together with the current server version, avoiding partial completion. Capture exact previous states only for successful changes and expose Undo mark done in the existing notice: Select all → Mark done = 2 clicks; Undo = 1. Restores use the returned server version and preserve agent ownership; stale versions are rejected rather than overwriting later work. Failed completion items remain selected, and failed undo items retain the existing retry behavior. Reopen, Reject, and Inbox move Undo remain pending for their distinct ownership/external-side-effect contracts.

## Tenth layer: direct selection and ranges

Project feedback and Inbox expose native checkboxes without entering Select mode first. Shift-click extends selection over the current visible order; ranges respect the 500-item cap and Inbox all/exclusions semantics. Clicking the comment still opens it outside bulk mode. Arbitrary disconnected items require N selections; a contiguous range takes two selections regardless of N. Browser verified at 1440/390 px including completion and Undo. Full suite: 2,971 passed, TypeScript clean, diff line/branch coverage 100%.

## Eleventh layer: server-authenticated Undo receipts

Optional captureUndo returns a signed, one-hour receipt bound to actor, project, comment, exact post-write version, prior statuses and prior agent claim. Restore rechecks current permission and applies the signed snapshot through the existing database CAS. No client-supplied agent ownership is trusted. Missing signing configuration fails before mutation.

Product decision: a reversible dashboard Reject preserves linked issues and says so explicitly. Automatically closing external issues cannot be fully undone safely without each provider's previous state and durable reconciliation; existing API callers retain their legacy close behavior. The new opt-in workflow avoids that side effect rather than claiming an external rollback occurred.

## Twelfth layer: bulk Reopen and Reject Undo

Reopen now performs one atomic open/unassigned update and offers one-click Undo via the signed receipt, restoring the former agent claim. Bulk Reject explicitly preserves linked issues (visible toolbar text and success notice) and offers the same one-click Undo. Existing stale-project/request tracking, permission errors, partial failure selection and version-conflict handling remain in place. Both actions verified in browser at 1440/390px: Select all → action = 2 clicks; Undo = 1. Full suite 2,998 passed, TypeScript clean, diff coverage 100%. Single-comment legacy rejection remains an audit item; this layer changes bulk actions only.

## Thirteenth layer: Inbox restore database prerequisite

Add a compatible assignment RPC returning committed timestamps, plus an actor/owner/version-fenced inverse. Restore locks comments before checking agent-share and external-work references and refuses to detach feedback already in use. Concurrent Undo has one winner. Five real local Postgres tests pass (including wrong owner, revoked access, changed version and existing share), migration-source parity and Drizzle consistency pass. No shared database modified.

## Fourteenth layer: opt-in Inbox move versions and restore API

Bulk assignment can opt in to exact committed versions without changing legacy response behavior. The restore endpoint validates 1–500 UUID/timestamp pairs, current manage permission and authenticated actor identity. It reports skipped items separately; the RPC rechecks ownership, references and versions atomically. Full suite: 3,011 passed, 209 skipped; targeted tests and diff coverage 100%, TypeScript passed.

## Fifteenth layer: one-click Undo of Inbox bulk moves

Bulk moves request exact committed versions and expose Undo in the destination project or the standalone Inbox view. One click restores in batches of 500; retries contain only unprocessed batches. Changed/shared items are reported separately. Account changes and unmount prevent stale UI updates. Desktop/mobile browser verified 21-item move in two clicks and Undo in one. Full suite: 3,018 pass, 209 skipped; types and diff coverage pass.

## Sixteenth layer: direct external export destinations

From a selected comment, Integrations → provider → Create issue took three clicks. Expose Send to GitHub / Linear / Jira directly, followed by the existing draft review/Create issue: two clicks. Keep provider permissions, rejected-feedback guard, duplicate-dispatch fence, existing-link behavior and explicit final creation. Browser verified using simulated HTTP (no actual external tickets), desktop/mobile; 51 targeted tests, TypeScript and diff coverage pass.

## Seventeenth layer: preserve audit project context

Run audit carries the current project in a base-aware encoded URL. The launcher selects it only after matching the authenticated project list; absent/unavailable keys retain the existing safe list default. No automatic audit or network mutation. Removes two dropdown clicks when auditing a non-first project. Fourteen targeted tests, TypeScript and 100% diff coverage pass; browser confirms desktop/mobile project selection and no automatic POST.

## Eighteenth layer: explicit widget handoff and recoverable prompts

Sending open feedback now says Accept & send to agent and explains exactly how many open items are accepted. Record/display the committed handoff and refresh feedback before fetching prompts. A prompt-load failure therefore cannot hide acceptance; retry fetches prompts for the same session without another mutation. Copying only writes the clipboard (verified by tests). Existing agent claims are not cancelled by copying or retrying. Browser verified failure/retry at 1440/390px with the actual widget and simulated HTTP; targeted tests and diff coverage pass.
