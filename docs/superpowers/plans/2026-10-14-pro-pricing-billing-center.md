# TDP-5794 implementation plan

## Scope

Restack the existing Pro pricing and Billing Center UI from `docs/cloud-plans-entitlements`, adapt it to current trunk, add Storybook to the Pro value proposition, and preserve current private-project/Agent work.

## Steps

1. Port the smallest reusable design-system primitives required by the existing pricing comparison and import their shared styles into the landing.
2. Port the existing pricing comparison, checkout-state helper, and tests; update plan copy so Pro names Storybook, private projects, Agent handoff, tracker integrations, and collaborator capacity while Studio remains a superset.
3. Add typed billing API helpers that accept the final TDP-5792 actions and normalize the current summary during the transition.
4. Port the existing Billing Center lifecycle, plan, usage, recovery, and safe-redirect UI onto the single `/dashboard/billing` route.
5. Preserve checkout state through authentication and pass successful-return state into Billing Center reconciliation.
6. Add/adjust focused tests for every changed behavior, then run typecheck, relevant test suites, builds, and the repository diff-coverage gate.
7. Perform a local browser review, fix visual/accessibility regressions, commit, push, open a PR linked to TDP-5794, and move the issue to review.

## Dependency boundary

The PR may be reviewed against mocks before TDP-5792 lands. It must not be declared production-ready until its plan/cycle/action contract is verified against Pranav's final backend and Stripe configuration.
