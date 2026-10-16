# Enable CRRT Cloud billing

This is an operator runbook. Merging the code does not enable database quotas: the migration seeds enforcement off, and deployment builds only perform a read-only configuration check. Pricing UI and local extension changes ship independently. API Agent checks follow `CRRT_DEPLOYMENT_MODE`; Stripe endpoints additionally require `STRIPE_ENABLED=true`.

## 1. Deploy the schema and backend first

Merge/deploy the other PR containing `0040_inbox_bulk_assignment.sql` before this stack’s `0041_cloud_plans.sql`. Keep its SQL, snapshot and journal entry unchanged. Our migration follows its snapshot and starts with `cloud_plan_settings.enabled=false`.

The deployment pipeline runs `bun run cloud:check`, builds the application, then runs `db:migrate`. It never runs `cloud:configure`. An activated Cloud database requires explicit Cloud mode on every later deployment; omitted/Community mode fails the preflight before publication.

Use separate databases and Stripe environments for sandbox, production and Community. Do not change a production Cloud database to Community to bypass checks.

Migration `0043_legacy_users.sql` marks the auth users present at deployment as legacy; later signups keep the free default. Untouched legacy billing placeholders are cleaned when deleting an auth user, so the backfill does not block deletion for previously unbilled users. Rows with Stripe history or an active billing lease retain the existing deletion protection. Agent handoff rechecks and locks effective billing access even before quota activation; the quota switch does not bypass Cloud Agent eligibility.

## 2. Configure Stripe in a sandbox

Create active USD monthly recurring prices for:

| Product | Monthly price |
| --- | ---: |
| CRRT Pro | $19 |
| CRRT Studio | $49 |

Use distinct `price_…` IDs. Tax must not be included in the price. Configure Stripe Tax so automatic-tax Checkout can complete. Configure Customer Portal to expose only the intended Pro/Studio monthly prices, permit the desired plan changes and cancellation, and deliberately choose proration and billing-anchor behavior. Preserve the anchor for same-window plan changes so upgrades cannot reset consumed quotas.

Create a **separate legacy Customer Portal configuration** in each Stripe environment:

- Disable subscription updates/plan switching (`features.subscription_update.enabled=false`). Legacy users already have Pro included; Studio upgrades start through CRRT Checkout.
- Enable cancellation at the end of the current billing period (`features.subscription_cancel.enabled=true`, `mode=at_period_end`). After Studio ends, CRRT restores the included Pro baseline.
- Enable payment-method updates and invoice history so users can manage their Studio payments.
- Keep the configuration active and save its `bpc_…` ID as `STRIPE_LEGACY_PORTAL_CONFIGURATION_ID` on the server.

Every legacy Portal redirect, including checkout recovery, explicitly selects and validates this configuration. A missing, inaccessible, inactive, or unsafe configuration blocks the redirect; it never falls back to the default portal. Regular customers retain the default Pro/Studio portal. Do not expose the default portal's shareable login link to legacy users; disable that login link and send customers through CRRT's authenticated Billing page.

Register the API webhook endpoint, `https://<api-host>/api/v1/billing/webhook`, for these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Use that endpoint’s signing secret. For local sandbox testing, Stripe CLI may forward those events to the local API and supplies a separate local signing secret.

## 3. Set the server environment

Set these through the deployment’s secret/environment settings. For local Docker, use the ignored `.env.docker.local`; never commit keys or database credentials.

```dotenv
CRRT_DEPLOYMENT_MODE=cloud
STRIPE_ENABLED=true
STRIPE_MODE=test
STRIPE_SECRET_KEY=<sandbox secret key>
STRIPE_WEBHOOK_SECRET=<matching sandbox endpoint signing secret>
STRIPE_PRO_PRICE_ID=<sandbox Pro monthly price ID>
STRIPE_STUDIO_PRICE_ID=<sandbox Studio monthly price ID>
STRIPE_LEGACY_PORTAL_CONFIGURATION_ID=<matching legacy portal bpc_ ID>
STRIPE_RETURN_URL=https://<dashboard-host>/dashboard/billing
DATABASE_URL=<direct connection for this environment's database>
```

These settings enable Checkout, Portal and webhook processing; they do not enable database quota enforcement. Cloud mode also enables API Agent entitlement checks, independently of the database switch. After changing deployment environment values, deploy the new backend so running API workers receive them.

With those same values loaded in the operator shell, run:

```sh
bun run cloud:check
```

This is read-only. It validates mode consistency and enabled Stripe configuration without changing the activation switch.

## 4. Reconcile accounts and verify readiness

Existing owners should sign in and open `/dashboard/billing`, then refresh billing status. Authenticated `GET /api/v1/billing` reconciles that owner’s current Stripe subscriptions and durable trial history; the browser redirect itself never grants access. Verify existing billing rows have the intended catalog plan and trusted current-period boundaries. Previous single-price subscriptions do not map automatically to Pro/Studio: decide and complete their transition before enabling enforcement. Review unowned projects and retained personal Cloud feedback before activation.

In the sandbox, exercise a card-backed 14-day trial, cancellation/re-subscription without a second trial, upgrade/downgrade, renewal, failed payment, signed webhooks and duplicate delivery. Check quota boundaries, retained reads/exports after expiry, local extension capture and retry-safe import. Fix any unmapped prices or incomplete Tax/Portal settings before proceeding. Also verify a legacy user can start a Studio trial, manage invoices/payment methods, and cancel Studio at period end without seeing paid Pro as a plan choice. Test the Manage billing button and redirects from an already-active subscription and a recovered completed checkout. Remove or misconfigure the legacy portal ID and confirm all three redirects fail without opening the default portal.

A rejected/unknown Checkout attempt retains its fixed request/key until recovery or its 35-minute deadline.

The database integration suite truncates fixtures. Run it only on a disposable local database, never on production or a shared environment.

## 5. Explicitly activate quotas

Only after the new backend is live and account/data readiness is confirmed, load that environment’s server configuration and direct database connection, then run:

```sh
bun run cloud:check
bun run cloud:configure
```

`cloud:configure` sets the database switch from `CRRT_DEPLOYMENT_MODE`; for Cloud it enables enforcement. This is a database write and is not part of merging or building. Keep `CRRT_DEPLOYMENT_MODE=cloud` on every worker/deployment afterward.

Verify `public.cloud_plan_settings` has `id=1, enabled=true`, then check owner billing summaries, normal writes within capacity, subscription-required failures (402), quota failures (409), and authorized reads/exports after expiry. Do not fabricate quota usage or Stripe states in production.

## 6. Enable live payments separately

Repeat the verified setup using production’s separate database, live Stripe products/prices and live webhook endpoint. Set `STRIPE_MODE=live`, use the matching live secret key, live price IDs, the separate live legacy portal configuration ID, and endpoint signing secret, and use the production dashboard return URL. Sandbox price IDs and signing secrets cannot substitute for production values.

Deploy, run the read-only preflight, reconcile production accounts, verify the backend and then perform the explicit quota activation step for that database. Complete the separately required retention/legal policy before launch. A failed publication must leave enforcement off; do not activate against an old backend.

### Screenshot cleanup

The existing `/api/v1/internal/extension-image-cleanup` minute cron processes up to 100 **pending, due** screenshot deletions per run. Keep `CRON_SECRET` configured. Successful jobs leave the queue; failed jobs retry after 15 minutes. Permanent UUID tombstones remain solely to prevent deleted-feedback resurrection, so old successful deletions do not slow fresh cleanup.

Both normal capture and import use [Supabase signed upload permissions](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl). Before uploading, the API records the permission's server-enforced expiry while locking the live actor-owned comment. Deletion copies the latest expiry plus a 15-minute settling allowance into its final cleanup schedule. Immediate deletion and import's post-upload check still remove objects promptly; the scheduled pass recovers crashes or uncertain responses after all issued permissions have expired. This uses Supabase's documented two-hour signed-upload lifetime, the API's 60-second execution limit, and a settling allowance for Storage requests admitted before expiry. It does not depend on rescanning all historical deletions. Cleanup is independent of commercial activation.
