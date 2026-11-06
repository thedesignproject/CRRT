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

New Cloud Checkout sessions enable Managed Payments. See the [rollout and recovery notes](cloud-billing-runbook.md#managed-payments-rollout-and-recovery) for product eligibility, existing subscriptions, persisted requests, legacy Portal/Link checks and rollback limits. No database migration is added for this change.

With the Docker Supabase stack running and a Stripe sandbox configured, run:

```sh
bun --env-file=/path/to/.env.docker.local scripts/verify-managed-payments.ts
```

The script refuses nonlocal Supabase hosts and live Stripe keys. It starts this checkout's API on an unused loopback port, creates isolated local users and sandbox products/prices/customers, verifies authenticated Checkout and retry persistence for all four plan/cycle pairs, verifies trial request eligibility and legacy Studio/Portal access, and sends locally signed synthetic webhook events to test duplicate delivery, tamper rejection and current-state reconciliation. It expires its sessions, deletes its customers/local fixtures and archives its prices/products afterward; it never truncates tables or changes the database activation switch. The existing local sandbox legacy Portal configuration must be configured. This is not a hosted Checkout payment-completion/renewal test, and sandbox purchases do not expose Link's order-management UI. Complete those lifecycle and Link-specific checks before live activation.

Commercial checks and browser plan UI never replace project permissions, feedback privacy, guest capabilities or origin validation. Self-hosted Community access does not depend on Stripe.
