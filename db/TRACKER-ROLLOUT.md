# Tracker recovery rollout

0032 is an additive rollout for tracker recovery. It leaves the legacy GitHub claim/release RPCs unchanged and adds service-only v2 RPCs for the new app. An old app remains compatible if deployment fails after migration. New outbound dispatches use positive-infinity leases until their exact sender acknowledges completion with negative infinity; legacy claimers cannot steal an active new export after a timeout.

A GitHub uncertain row with no lease is a completed legacy release. The new app can claim it for marker lookup or an admin can resolve it after checking the tracker. New code never clears an uncertain lease through release, so an interrupted new sender cannot produce that legacy state. Finite uncertain leases are not automatically acknowledged: they may belong to an active old worker. The migration does not infer completion from lease expiry.

## Before deploying the app

1. Pause tracker sends and drain/terminate all pre-upgrade GitHub, Linear and Jira workers. Keep the old deployment from receiving new tracker requests during the transition. Applying the schema alone does not require a transition; the old RPC contract remains available.
2. Inventory each affected project using the direct server-only database connection:
   `DATABASE_URL=... bun db/tracker-rollout.ts PROJECT_KEY`
   The default is read-only. It lists finite, leased uncertain exports; released GitHub rows already work without a transition. It excludes completed and new-protocol infinite leases.
3. Only after confirming every legacy sender has terminated, acknowledge that project's candidates:
   `DATABASE_URL=... bun db/tracker-rollout.ts PROJECT_KEY --confirm-legacy-workers-stopped`
   The command refuses an active coordination lock, serializes with GitHub claims, and acknowledges exact row/lease identities in one transaction. Repeating it is safe. It does not erase uncertainty, create issues, or release privacy fences.
4. Deploy the new app and resume tracker sends. Admins can retry marker recovery for GitHub, or check the external tracker and resolve pending exports through the authenticated recovery UI for all providers.

Never run the acknowledgment while an old worker can still send. Legacy workers do not hold the new coordination lock, so the confirmation is an operator prerequisite, not something the command can infer. If worker termination cannot be confirmed, leave the export fenced and postpone the transition. New-protocol crash recovery still requires confirming that exact sender has stopped; use the service-only acknowledgment RPC described in `docs/tracker-dispatch-recovery.md`.

Validate against real PostgreSQL: `DATABASE_URL=... bun run test -- db/project-privacy.integration.test.ts api/_lib/store.github-issue.integration.test.ts api/_lib/tracker-dispatch-recovery.integration.test.ts`. The first suite covers mixed-version fencing and dry-run/confirmed legacy transitions; the second preserves the original app contract; the third checks new-app recovery after coordination failure.
