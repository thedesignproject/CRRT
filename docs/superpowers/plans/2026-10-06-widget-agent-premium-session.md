# Premium widget Agent session — implementation plan

Issue: #301

Base: `trunk`

Branch: `feat/widget-agent-premium-session`

## Outcome

A signed-in project owner whose server-side billing row has an eligible status and trusted price can create an idempotent Agent share from the npm widget. The share contains exactly the selected feedback, selected open feedback is accepted atomically, and every authorization decision is repeated inside the transaction that creates or reuses the share.

## Steps

1. Add an additive, RLS-protected idempotency ledger keyed by project, actor, and client key.
2. Add a server-only Agent plan catalog and fail-closed entitlement resolver based on the project owner billing account.
3. Add a widget Agent eligibility endpoint that authenticates the narrow widget credential before returning safe state.
4. Add a transactional widget Agent share RPC that locks membership and billing state, validates exact comments, accepts open feedback, and returns the original share on a retry.
5. Add the widget Agent session endpoint, stable error mapping, and original-token recovery for idempotent retries.
6. Preserve the legacy eligibility/share APIs unchanged for older clients.
7. Verify schema generation, SQL review, authorization/privacy tests, typecheck, build, and 100% line/branch diff coverage against `trunk`.

## Rollout safety

This slice permits only the project owner. Admins and members receive `seat_limit_reached` until #302 lands with transactional seat enforcement. Unknown price IDs and unavailable billing state deny access.
