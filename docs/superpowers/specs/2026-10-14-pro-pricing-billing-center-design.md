# Pro pricing and Billing Center design

## Outcome

CRRT presents one coherent path from the public pricing section to the signed-in Billing Center. A visitor can understand the difference between Self-hosted, Pro, and Studio; choose an allowlisted plan and billing cycle; sign in without losing that choice; and complete or recover checkout from one billing route.

This restacks the existing work from `docs/cloud-plans-entitlements` onto current trunk. It does not create another billing implementation and it does not modify Stripe or entitlement policy owned by TDP-5792.

## Audience and job

The primary audience is a product builder arriving after Dianne's Storybook video. Their immediate job is to understand that CRRT Pro connects a Storybook review to the same private feedback and Agent workflow, then start a trial without learning CRRT's internal architecture.

## Information architecture

```text
Public pricing
  Self-hosted        Pro (recommended)          Studio
  Free               Storybook + private work  Everything in Pro + capacity
       \                    |                    /
        \------ signed plan + cycle -----------/
                           |
                       Sign in
                           |
                    /dashboard/billing
              status + usage + plan + Stripe
```

There is one public pricing surface and one authenticated billing route. The older sandbox-only billing presentation is not retained.

## Visual direction

This is an extension of the approved CRRT interface, not a visual redesign.

- Color: deep black `#0A0A0A`, soft black `#151515`, paper white `#F5F5F2`, muted ink `#A3A3A3`, carrot orange from the existing `--crrt-carrot` token, and the existing border tokens.
- Type: existing CRRT sans for product copy; existing mono face only where the current landing already uses it. Pricing labels stay sentence case.
- Layout: a single comparison row on desktop and a linear stack on small screens. Pro receives the only strong emphasis because it is the plan demonstrated in the Storybook workflow.
- Alignment: left aligned for scanability; prices and actions align by row rather than floating in independent cards.
- Motion: only direct interaction feedback on cycle selection and buttons; reduced-motion behavior remains inherited from CRRT.
- Structure: borders separate plan decisions and usage data. There are no decorative nested cards or gradients.

The memorable element is the Pro column's clear workflow promise: Storybook review, private feedback, and Agent handoff in one path. Everything around it remains quiet.

## Public pricing behavior

- Self-hosted stays free and links to the self-host guide.
- Pro explicitly includes private projects, Storybook integration, Agent workflow, GitHub/Linear/Jira handoff, 10 projects, 10 internal collaborators, unlimited guests, 2,000 comments per month, and 5 Product Audits per month.
- Studio says “Everything in Pro” and only adds higher capacity, avoiding the impression that core workflow features require Studio.
- The cycle control uses only server-allowlisted monthly/yearly values from the final TDP-5792 contract.
- Until the signed checkout-state backend lands, signed-out CTAs open dashboard sign-in with an allowlisted plan hint. Billing Center preselects that plan and requires confirmation; the hint grants no billing authority. Signed plan/cycle continuation and yearly checkout remain deferred to TDP-5792.
- Signed-in CTAs call the same `/v1/billing` endpoint and accept only trusted Stripe destinations.
- Errors remain inline with a retry/dismiss path.

## Billing Center behavior

- `/dashboard/billing` is the only authenticated billing UI.
- It renders lifecycle-specific copy for inactive, checkout pending, trial, active renewal, scheduled cancellation, past-due grace, and read-only states.
- Plan selection supports Pro and Studio only; current and scheduled plans are explicit.
- Usage is visible for projects, internal users, comments, and Product Audits.
- Checkout success returns are reconciled with the server before the UI claims access.
- Billing-disabled, request failure, invalid redirect, and blocked action states fail closed and explain the next action.
- Stripe Portal remains the only surface for payment-method management, cancellation, and an existing subscription's billing operations.

## Compatibility boundary

The UI consumes the final contract described in TDP-5792 while tolerating the current trunk summary shape so the PR can be reviewed independently. Production activation, Stripe price configuration, webhook verification, and package deployment remain Pranav's work.

## Verification

- Unit tests cover plan/cycle preservation, safe redirect validation, comparison copy, lifecycle copy, billing-disabled and failure states, return-state continuation, and stale requests.
- Landing and dashboard typechecks/builds pass.
- Diff line and branch coverage are 100% against `origin/trunk`.
- A browser pass verifies desktop/mobile pricing and the Billing Center with representative mocked states before the launch rehearsal.
