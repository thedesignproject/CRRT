# Local Cloud plan branch stack

All six branches are local, each with exactly one commit relative to its immediate parent. No PRs were opened or pushed. The stack is rebased onto trunk `f2d95034`, which includes `0040_inbox_bulk_assignment`. These six layers each add one commit above it. Each layer targets the branch immediately below it.

| Layer | Branch | Changed lines (added + deleted) |
| --- | --- | ---: |
| 1 | `feat/cloud-plan-schema` | 6216 |
| 2 | `feat/cloud-plan-billing-backend` | 424 |
| 3 | `feat/cloud-plan-access` | 659 |
| 4 | `feat/extension-cloud-workflow` | 813 |
| 5 | `feat/cloud-plan-ui` | 600 |
| 6 | `chore/cloud-plan-rollout` | 585 |

The first layer is the requested size exception. It includes schema source, **one migration: `0041_cloud_plans.sql`**, its snapshot/journal, and database regression tests. All other layers are below 900 changed lines and contain no migrations.

The Chrome follow-up fixes signed-in local feedback disclosure and import shortcuts, compact local feedback rows, readable API errors, duplicate settings keys, expired-plan write notices, and scheduled cancellation dates. No additional migrations are required.

## Validation

- Full Vitest suite and 100% changed-line **and branch** coverage on every exact branch against its immediate parent. The schema layer has no instrumented TypeScript diff; its database behavior is tested separately.
- 30 database regressions passed against isolated disposable databases, including concurrency, limits, invitation reservations/expiry, downgrade preservation, transfers, import retries/resolved state, audit refunds/cancellation, Community bypass and direct-client denial.
- The import workflow fences late uploads against deletion and retains permanent actor-bound deletion markers alongside a due-work queue serviced by the existing authenticated minute cleanup job. Signed upload windows bound late writes; cleanup retires successful work and retries failures independently of historical deletion count. Missing-row DELETE retries use a cleanup-only receipt lookup. Export uses UUID keyset pagination to avoid shifting-offset omissions/duplicates.
- The import workflow includes compatibility for Supabase's HTTP 400 duplicate-upload response.
- Typecheck, Drizzle snapshot consistency, widget/dashboard/extension builds passed. Vercel API artifacts built locally; signed raw-body webhook, invalid signature and disabled-mode probes passed through both Bun and the built Vercel function using dummy credentials.
- Billing UI checked at desktop and 390px mobile widths; no horizontal overflow. Canceled state preserved usage and billing recovery actions. Screenshot: `/private/tmp/crrt-cloud-plan-billing-preview.png`.
- Enforcement activation is an explicit post-deployment step. Read-only prepublication mode checks and activation-off defaults validated. Deployment-mode CLI validated in the disposable database: explicit Cloud enablement, protection against omitted mode on an existing Cloud database, and Community bypass.

The consolidated six-layer coverage results and logs are in `/private/tmp/crrt-review-validation/`. The original 13-branch stack is preserved in `/private/tmp/cloud-plan-original-13-branches.bundle`. The current complete worktree is `/private/tmp/crrt-cloud-plans`, on `chore/cloud-plan-rollout`; the original checkout is unchanged.

The dashboard layer incorporates the approved Pro/Studio model instead of the pending Free/Pro design in GitHub PR #293. That existing PR was not modified.

See [implementation and rollout notes](cloud-plans.md) and the [approved product policy](cloud-plans-policy.md). Live payment testing, Stripe/Portal configuration, deployment activation and the separately required retention/legal policy remain production rollout work; no deployed database or Stripe settings were changed.
