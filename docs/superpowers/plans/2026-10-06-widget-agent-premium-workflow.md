# Premium Agent workflow inside the widget — implementation plan

Issue: #303

Base: `feat/widget-agent-collaborator-seats`

Branch: `feat/widget-agent-premium-workflow`

## Outcome

Shift+A and the visible Send to agent control open one authenticated, premium bridge without navigating the customer page. The bridge lists only authorized feedback, creates an exact selection-scoped share on confirmation, and supports human review and resolution actions in place.

## Steps

1. Add actor-bound database RPCs for preflight feedback reads and exact batch accept/reject/resolve mutations.
2. Return safe current-page feedback only after widget authentication and premium eligibility succeed.
3. Add widget-client helpers for eligibility, exact session creation, lifecycle mutations, and owner checkout.
4. Introduce an explicit premium bridge state machine while retaining the legacy bridge only for older callers.
5. Resume the same modal after popup login, preserve selection across retry/upgrade, discard intent on page/project change, and deduplicate shortcuts and confirms.
6. Trap and restore focus, announce state transitions, expose checkbox/status semantics, and keep every action keyboard reachable.
7. Verify server authorization, exact selection, lifecycle, popup failure/retry, React 18/19 compatibility, typecheck, build, and 100% diff coverage against #302.

## Rollout safety

The secure path never loads comments, prompts, or a share before authorization. The existing public project-share route remains unchanged for supported older clients and emits deprecation telemetry; private projects continue to reject it.
