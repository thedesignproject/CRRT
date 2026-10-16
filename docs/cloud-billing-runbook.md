# Enable CRRT Cloud billing

This is an operator runbook. Merging the code does not enable database quotas: the migration seeds enforcement off, and deployment builds only perform a read-only configuration check. Pricing UI and local extension changes ship independently. API Agent checks follow `CRRT_DEPLOYMENT_MODE`; Stripe endpoints additionally require `STRIPE_ENABLED=true`.

## 1. Deploy the schema and backend first

Merge/deploy the other PR containing `0040_inbox_bulk_assignment.sql` before this stack’s `0041_cloud_plans.sql`. Keep its SQL, snapshot and journal entry unchanged. Our migration follows its snapshot and starts with `cloud_plan_settings.enabled=false`.

The deployment pipeline runs `bun run cloud:check`, builds the application, then runs `db:migrate`. It never runs `cloud:configure`. An activated Cloud database requires explicit Cloud mode on every later deployment; omitted/Community mode fails the preflight before publication.

Use separate databases and Stripe environments for sandbox, production and Community. Do not change a production Cloud database to Community to bypass checks.

## 2. Configure Stripe in a sandbox

Create active USD recurring prices for:

| Product | Monthly price | Yearly price |
| --- | ---: | ---: |
| CRRT Pro | $19 | $192 |
| CRRT Studio | $49 | $492 |

Use distinct `price_…` IDs. Tax must not be included in the price. Configure Stripe Tax so automatic-tax Checkout can complete. Configure Customer Portal to expose only the intended Pro/Studio monthly and yearly prices, permit the desired plan changes and cancellation, and deliberately choose proration and billing-anchor behavior. Preserve the anchor for same-window plan changes so upgrades cannot reset consumed quotas.

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
STRIPE_PRO_YEARLY_PRICE_ID=<sandbox Pro yearly price ID>
STRIPE_STUDIO_YEARLY_PRICE_ID=<sandbox Studio yearly price ID>
BILLING_STATE_SECRET=<at least 32 random characters>
STRIPE_RETURN_URL=https://<dashboard-host>/dashboard/billing
DATABASE_URL=<direct connection for this environment's database>
```

Generate `BILLING_STATE_SECRET` with `openssl rand -hex 32`. Store the output only in the backend's secret settings, use a separate value for each environment, and keep the same value across API workers in that environment. It is an application signing secret, not a Stripe-issued secret. Replacing it invalidates outstanding sign-in continuations.

These settings enable Checkout, Portal and webhook processing; they do not enable database quota enforcement. Cloud mode also enables API Agent entitlement checks, independently of the database switch. After changing deployment environment values, deploy the new backend so running API workers receive them.

With those same values loaded in the operator shell, run:

```sh
bun run cloud:check
```

This is read-only. It validates mode consistency and enabled Stripe configuration without changing the activation switch.

## 4. Reconcile accounts and verify readiness

Existing owners should sign in and open `/dashboard/billing`, then refresh billing status. Authenticated `GET /api/v1/billing` reconciles that owner’s current Stripe subscriptions and durable trial history; the browser redirect itself never grants access. Verify existing billing rows have the intended catalog plan and trusted current-period boundaries. Previous single-price subscriptions do not map automatically to Pro/Studio: decide and complete their transition before enabling enforcement. Review unowned projects and retained personal Cloud feedback before activation.

In the sandbox, exercise a card-backed 14-day trial, cancellation/re-subscription without a second trial, upgrade/downgrade, renewal, failed payment, signed webhooks and duplicate delivery. Check quota boundaries, retained reads/exports after expiry, local extension capture and retry-safe import. Fix any unmapped prices or incomplete Tax/Portal settings before proceeding. A rejected/unknown Checkout attempt retains its fixed request/key until recovery or its 35-minute deadline.

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

Repeat the verified setup using production’s separate database, live Stripe products/prices and live webhook endpoint. Set `STRIPE_MODE=live`, use the matching live secret key, live price IDs and endpoint signing secret, and use the production dashboard return URL. Sandbox price IDs and signing secrets cannot substitute for production values.

Production setup checklist:

- Add a $192 USD yearly recurring price to the existing live CRRT Pro product and a $492 USD yearly recurring price to the existing live CRRT Studio product. Use every 1 year, with tax excluded; retain the existing monthly prices.
- Set `STRIPE_PRO_YEARLY_PRICE_ID` and `STRIPE_STUDIO_YEARLY_PRICE_ID` to those new live price IDs. Each price has its own ID even when it belongs to an existing product. Configure both yearly variables together and retain the two monthly variables.
- Generate a production-only `BILLING_STATE_SECRET` using `openssl rand -hex 32` and store it in the backend environment alongside the Stripe settings.
- In the live Customer Portal configuration, enable the intended Pro/Studio monthly and yearly prices for subscription updates. Verify cancellation, proration and billing-anchor behavior as described in step 2.
- Verify live Stripe Tax readiness, the six webhook event subscriptions from step 2, the live endpoint signing secret and the production dashboard return URL.
- Apply `0044_yearly_billing_windows.sql` through the normal migration pipeline before enabling annual Checkout, then deploy the backend with the new environment values. Verify annual Checkout, signed-out plan/cycle continuation and Portal switching before launch.

Deploy, run the read-only preflight, reconcile production accounts, verify the backend and then perform the explicit quota activation step for that database. Complete the separately required retention/legal policy before launch. A failed publication must leave enforcement off; do not activate against an old backend.

### Screenshot cleanup

The existing `/api/v1/internal/extension-image-cleanup` minute cron processes up to 100 **pending, due** screenshot deletions per run. Keep `CRON_SECRET` configured. Successful jobs leave the queue; failed jobs retry after 15 minutes. Permanent UUID tombstones remain solely to prevent deleted-feedback resurrection, so old successful deletions do not slow fresh cleanup.

Both normal capture and import use [Supabase signed upload permissions](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl). Before uploading, the API records the permission's server-enforced expiry while locking the live actor-owned comment. Deletion copies the latest expiry plus a 15-minute settling allowance into its final cleanup schedule. Immediate deletion and import's post-upload check still remove objects promptly; the scheduled pass recovers crashes or uncertain responses after all issued permissions have expired. This uses Supabase's documented two-hour signed-upload lifetime, the API's 60-second execution limit, and a settling allowance for Storage requests admitted before expiry. It does not depend on rescanning all historical deletions. Cleanup is independent of commercial activation.

## Annual billing and signed sign-in continuation

Merge and deploy PR #339 (`0043_legacy_users.sql`) before this backend PR. Migration `0044_yearly_billing_windows.sql` depends on its legacy effective-account helpers and preserves legacy Pro access. The unchanged 0043 migration and metadata are carried here as prerequisites for fresh databases; 0044 is the only new annual-billing migration. Never deploy 0044 before 0043. Monthly and trial periods retain their exact Stripe boundaries; only longer annual periods are subdivided. Annual payment periods remain Stripe-owned; comment/audit windows renew monthly in UTC, anchored to the original period start (including month-end clipping without cumulative drift). The annual price must use `interval=year`, `interval_count=1`, USD, the exact approved amount, and exclusive/unspecified tax behavior. Missing or invalid annual configuration fails closed rather than creating monthly Checkout.

Signed-out pricing links use `GET /api/v1/billing?start=pro|studio&cycle=monthly|yearly`. This public route only signs the selected plan/cycle and redirects to the configured dashboard return URL. It never creates a customer or Checkout session and never accepts a client redirect. The state expires after 30 minutes, contains no account identity or payment authority, and is validated by authenticated `POST {action:"checkout_state",state}`. Direct authenticated Checkout also validates the cycle. Existing subscribers use Stripe Portal; direct plan changes remain disabled in the summary contract.

Before rollout, configure all four distinct prices and the server-only signing secret in the intended environment. Test annual trial conversion, annual renewal/cancellation, monthly quota resets, plan/cycle sign-in continuation, tampered/expired state, and Checkout retry/cycle replacement. This branch does not configure Stripe, alter deployments, or apply migrations to any shared database.
