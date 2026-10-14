# Stripe billing

The original test-only single-price billing foundation has been extended for the approved Cloud Pro/Studio policy. Use [the billing activation runbook](cloud-billing-runbook.md) for sandbox setup, required flags, webhook/Portal preparation, account synchronization and explicit quota activation. See [Cloud plan enforcement](cloud-plans.md) for prices, trials, deployment configuration, accounting, Community bypass, local extension mode and rollout preparation.

The integration retains the official Stripe SDK, hosted Checkout and Customer Portal, raw-byte signature verification, account leases, idempotent checkout recovery, and reconciliation of current subscription state rather than trusting browser redirects or webhook event snapshots. Webhook processing records a receipt only after durable success and returns a retryable failure otherwise.

Use one Stripe environment consistently for the API, Checkout, Portal and webhook. Configure these webhook event types:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook route keeps raw request bytes through both the Bun adapter and the built Vercel function. `node scripts/verify-stripe-runtime.mjs` exercises that behavior after building deployment artifacts with dummy test credentials and an ignored event type; it does not call Stripe or the database.

Commercial checks and browser plan UI never replace project permissions, feedback privacy, guest capabilities or origin validation. Self-hosted Community access does not depend on Stripe.
