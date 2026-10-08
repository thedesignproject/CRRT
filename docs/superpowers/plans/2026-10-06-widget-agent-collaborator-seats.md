# Owner-sponsored Agent collaborator seats — implementation plan

Issue: #302

Base: `feat/widget-agent-premium-session`

Branch: `feat/widget-agent-collaborator-seats`

## Outcome

A paid project owner sponsors Agent access for at most five unique admin/member collaborators across every project they own. Pending internal-role invitations reserve capacity, guests remain free, and the same person across multiple projects consumes one seat.

## Steps

1. Add service-only database helpers that resolve an owner's projects and count unique collaborator identities across memberships and pending invitations.
2. Serialize seat-affecting writes per owner and enforce the cap with database triggers so direct or future write paths cannot bypass it.
3. Replace multi-request invite acceptance with one transactional RPC that converts the reserved invitation into membership without a gap.
4. Revalidate collaborator capacity in Agent eligibility and in the same transaction that creates a widget Agent share.
5. Map the stable `agent_seat_limit_reached` failure at invite, acceptance, access-review, and role-change API boundaries.
6. Verify deduplication, release, over-limit behavior, race safety, typecheck, build, and 100% line/branch diff coverage against the #301 branch.

## Rollout safety

Existing memberships are never deleted. If an owner already has more than five collaborators, the owner keeps Agent access while collaborators fail closed until usage returns within the allowance.
