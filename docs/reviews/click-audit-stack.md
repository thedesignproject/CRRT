# Click audit: reviewer guide

This stack reduces repeated feedback actions and adds version-fenced Undo. Review bottom to top. Each PR targets the preceding branch; do not merge a top layer directly into trunk.

## Review order

| PR | Change | Review focus |
| --- | --- | --- |
| #381 | Atomic review + implementation update | Optional fields, expected version, legacy caller compatibility |
| #382 | Undo bulk completion | Exact prior state, stale Undo and concurrent writes |
| #384 | Direct checkboxes and Shift ranges | Project/Inbox callbacks, deselection, 500-item limit |
| #385 | Signed Undo receipts | Actor/project/comment binding, expiry, signature and committed version |
| #386 | Undo bulk Reopen and Reject | Agent claim restoration; linked issues remain unchanged |
| #387 | Additive Inbox restore migration | Actor permission, row locks, existing share/external-work guards |
| #388 | Versioned move/restore API | Validation, current access, partial results and compatible legacy response |
| #389 | Undo bulk Inbox moves | Destination notice, chunks of 500, retry remaining chunks only |
| #390 | Direct export destinations | Draft/create confirmation and duplicate dispatch protection |
| #391 | Preserve audit project | Match URL key against accessible projects; never auto-run |
| #392 | Explicit widget acceptance and prompt retry | Acceptance disclosure; retry reuses the committed session |
| #393 | Undo individual Inbox moves | Same versioned move contract as bulk |
| Final layer | Undo individual status changes | Same signed receipt, no unfenced agent-claim restoration |

## Manual acceptance

Use a dedicated project and real backend for end-to-end acceptance. Mocked browser checks verify interaction/layout only.

1. Capture two comments with the widget and one with the extension. Confirm the extension comment appears in Inbox.
2. Move Inbox feedback to the project, then Undo. Repeat with a bulk selection. Feedback returns to Inbox without duplication.
3. Select individual rows and a Shift range. Mark ready, Mark done, Reopen and Reject; Undo each successful action. Include an agent-claimed item and verify its original claim returns.
4. In another tab, edit feedback after an action. Undo must refuse to overwrite the newer version. Feedback already shared or linked to external work must not be detached from its project.
5. Export through each connected provider. Inspect the draft, then create deliberately. No ticket should be created simply by selecting a destination.
6. Launch an audit from a non-first project. It should be preselected; no run starts before submission.
7. In the widget, select open feedback. Confirm the acceptance count before sending. Simulate prompt-fetch failure after session creation; Retry must fetch prompts without accepting again or creating another session. Copying must not mark work done.
8. Repeat the key controls at desktop and mobile widths and with keyboard navigation.

## Deployment and product boundaries

- Apply additive migration `0048_inbox_restore` before using the new Inbox RPCs. Existing assignment callers remain compatible. No shared database was manually modified during this review.
- Signed status Undo uses the existing server-side `WIDGET_AUTH_SECRET` and expires after one hour. It rechecks current permission and the exact committed version.
- Reversible dashboard Reject preserves linked GitHub/Linear/Jira issues. Legacy API clients retain their prior close behavior. Undo is not an external-provider rollback.
- Delete, OAuth consent, integration disconnect, and cancellation of active agent work are not covered by a generic Undo guarantee.
- #392 affects the npm widget. After review/merge, include it in the next versioned release following `docs/npm-releases.md`. No tag or npm release is created by this stack.
- CI checks React 18 and 19 and enforces 100% changed-line/branch coverage against each immediate parent. Local browser checks use simulated HTTP; full MCP/provider acceptance above still requires real connections.
