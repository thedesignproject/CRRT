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
| Dashboard select arbitrary N items | Enter select mode + N clicks + action | Direct selection/keyboard range + action | 5 | TBD | Pending |
| Inbox bulk action across pages (CommentList / ExtensionCommentsPage) | Select → Select page → Select all matching → action = 4+ | ≤2 | 4 | ≥8 | Pending |
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
