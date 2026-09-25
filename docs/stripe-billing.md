# Stripe billing v1

This is a test-only billing foundation: hosted subscription Checkout, the
Customer Portal, and subscription synchronization. It does not enforce project,
member, or audit limits. The proposed three-project / five-person Free allowance
and paid limits remain a follow-up. The flagged UI previews Free (3 projects,
5 people per project) versus Pro (higher project and team limits); these are
comparison copy only until quota enforcement is implemented. Pro caps are not yet set. Billing is owned by the authenticated user;
future project entitlements should resolve through the current project owner.

## Enable locally or in a preview

Leave `STRIPE_ENABLED` unset or `false` in production. Only the exact value `true`
enables billing. Disabled billing never initializes Stripe or accesses billing
tables: the summary returns `{ enabled: false }`, the UI is hidden, and POSTs
(including webhooks) return 404. No publishable key or client SDK is needed.

In a Stripe sandbox/test environment:

1. Create a product and a recurring Price. Set `STRIPE_PRICE_ID` to that test Price.
   The amount and currency are displayed by Stripe Checkout; CRRT has no hardcoded
   price. Replacing the Price later affects new checkouts, not existing subscriptions.
2. Enable/configure the Customer Portal for the same test environment, including
   cancellation, invoices, and payment-method updates. Keep plan switching disabled
   until multiple plans and entitlements are implemented.
3. Set these **server-only** environment variables in local configuration or in the
   Vercel **Preview** environment:

   ```dotenv
   STRIPE_ENABLED=true
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_ID=price_...
   STRIPE_RETURN_URL=http://127.0.0.1:5173/dashboard/billing
   ```

   Use the actual HTTPS preview dashboard URL for `STRIPE_RETURN_URL` in previews.
   This explicit allowlisted configuration prevents redirects based on client input
   or untrusted host headers. Live keys are rejected in v1. Keep each developer or
   preview database paired with its own Stripe sandbox to avoid cross-environment
   customer mappings. Do not use production database/service-role credentials for testing.
4. Apply the generated migrations to your local/preview database. This layer's
   migration is `0029`, based on PR #284's `0028`. Do not apply to production for
   this preview exercise. Deployment migrations are additive but run independently
   of the feature flag when a branch is eventually deployed.
5. Start the app with `bun run local:dev`. In another terminal:

   ```sh
   stripe listen --forward-to http://127.0.0.1:3001/api/v1/billing/webhook
   ```

   Use the listener's signing secret locally. For a deployed preview, register
   `https://<preview-host>/api/v1/billing/webhook` and use that endpoint's secret.
   The endpoint must be reachable by Stripe (account for preview deployment protection).
6. Subscribe the preview endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
7. Sign in, open your profile menu, and choose **Billing** (available even without a project).
   Choose **Upgrade to Pro** and complete it with Stripe test payment details.
   Checkout and the portal return to `/dashboard/billing`, which refreshes from
   Stripe. Use **Manage billing** to test cancellation and payment-method changes.
   **Refresh billing status** also reconciles state if a webhook was delayed.

## Operational behavior

`GET /api/v1/billing` returns availability and the caller's billing status.
`POST /api/v1/billing` accepts only `action: checkout` or `action: portal`.
It never trusts a client-provided customer, user, price, or return URL. Any signed-in
user can manage their own billing account; project members cannot manage an owner's
billing account. Billing lives at `/dashboard/billing`, outside project settings.
`GET /api/v1/billing?availability=1` checks the flag for account navigation without
accessing Stripe or the billing tables. Checkout explicitly disables Managed Payments
per session so a sandbox account default cannot opt CRRT into that separate product.

The server uses the official Stripe SDK and its pinned SDK API version. Both the
webhook and API must use the same test environment. Production deployment must
remain disabled until pricing, entitlements, and live-mode support are reviewed.

A database lease serializes checkout and reconciliation per account. Writes and
lease release are fenced by a random token. Concurrent requests return a retryable
conflict, rather than opening competing Checkout sessions. Customer/session
creation uses idempotency keys, and retries recover existing open sessions.
Subscriptions that are active, incomplete, trialing, past due, paused, or unpaid
are directed to the portal rather than starting a second subscription.

Webhook signatures are verified against the original bytes. The production Build
Output API emits a dedicated raw-body Stripe function; the shared API router
continues parsing JSON normally. The dedicated function disables Vercel request
helpers and writes native HTTP responses. The Bun local adapter passes a Buffer for this
route. Duplicate/out-of-order events retrieve current Stripe state under the same
lease rather than replaying event snapshots. Receipts are recorded after success;
processing failures return 503 so Stripe retries. RLS denies direct client access
to both billing tables. Only server-side Supabase service-role queries access them.

## Before enabling real billing

Finalize paid prices and limits, implement atomic quota/entitlement checks across
claiming and all membership entry points, define downgrade and owner-transfer
behavior, and decide audit allowances. Add live-environment support and monitoring,
and verify tax/invoice requirements for the business. Configure and test these
before changing the production flag. This v1 intentionally does not promise paid
features or enforce new limits on existing users.

## Validation

Run `bun run typecheck`, `bun run test:coverage`, then
`bun run test:diff-coverage -- feat/stripe-billing-schema` on the backend branch.
On the frontend branch, compare against `feat/stripe-billing-backend`.
On the schema branch, compare against `origin/fix/tdp-5057-resend-email-bounces`. The focused billing tests use the official SDK's signed test webhook
payloads and mock network calls; they require no Stripe credentials.

`api/_lib/billing/schema.integration.test.ts` additionally accepts
`BILLING_TEST_DATABASE_URL` for a **disposable** local database with `auth.users`
and migration `0029` applied. It verifies constraints, concurrent lease acquisition,
fencing, and RLS. Never point this test at a shared or production database.

After a local deployment-artifact build, run
`node scripts/verify-stripe-runtime.mjs` to exercise signed raw request bytes through
both the Bun adapter and the built Vercel webhook function. It uses dummy keys and
an ignored event type, so it never calls Stripe or the database.
