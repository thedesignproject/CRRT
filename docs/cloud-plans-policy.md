# CRRT plans and entitlements

**Status:** Product policy approved for implementation  
**Applies to:** CRRT Cloud, the hosted dashboard, the npm widget, and the CRRT browser extension  
**Does not restrict:** Community self-hosted installations

## 1. Product model

CRRT has three customer-facing options:

1. **Community** — free, self-hosted software.
2. **Cloud Pro** — managed CRRT Cloud for small teams.
3. **Cloud Studio** — managed CRRT Cloud for agencies and larger teams.

The free local mode in the browser extension is an acquisition and evaluation mode. It is not a fourth plan and does not use CRRT Cloud.

There is no permanently free CRRT Cloud plan. Each Cloud plan includes a 14-day trial.

## 2. Plans at a glance

| Capability | Community | Cloud Pro | Cloud Studio |
| --- | --- | --- | --- |
| Price | Free | USD 19/month | USD 49/month |
| Delivery | Self-hosted | Managed Cloud | Managed Cloud |
| Trial | Not applicable | 14 days | 14 days |
| Projects | No commercial limit | 10 | 50 |
| Internal users | No commercial limit | 10 | 25 |
| Guests | No commercial limit | Unlimited | Unlimited |
| New comments | No commercial limit | 2,000/month | 10,000/month |
| Product Audits | Uses the operator's infrastructure and credentials | 5/month | 30/month |
| Browser extension sync | Available when connected to the self-hosted instance | Included | Included |
| Managed hosting, storage, backups, and updates | No | Included | Included |

Cloud pricing is monthly at launch. Taxes, when applicable, are added by the payment provider.

## 3. Community: free self-hosted

Community includes the complete CRRT product under the repository's open-source license. CRRT does not apply commercial project, user, comment, or Product Audit limits to self-hosted installations.

The operator is responsible for:

- application hosting and updates;
- database and file storage;
- backups and recovery;
- email delivery;
- AI providers and Product Audit compute;
- GitHub, Linear, Jira, and other integration credentials;
- monitoring, security, and regulatory compliance.

Stripe entitlement checks must be disabled in self-hosted mode. A self-hosted instance must not become unavailable because CRRT Cloud billing is unavailable.

## 4. Free browser extension mode

The CRRT extension can be installed and used without a Cloud subscription in a deliberately limited local mode:

- one local project;
- one local user;
- up to 50 locally stored comments;
- capture, annotate, edit, resolve, and delete local feedback;
- local screenshots within the extension's storage allowance;
- export of all local feedback.

Local mode does **not** include:

- CRRT Cloud storage or backups;
- the hosted web dashboard;
- synchronization across browsers or devices;
- shared projects or shared pins;
- members, guests, or invitations;
- email notifications;
- GitHub, Linear, Jira, or agent handoff;
- Product Audit;
- managed recovery if browser data is removed.

Local comments do not consume a Cloud quota. When the owner starts a Cloud trial or subscription, the extension may import the local project and its comments into Cloud. Each imported comment then counts once in the Cloud account's current monthly comment usage.

## 5. Cloud capabilities

Both paid Cloud plans include:

- managed application hosting, database, storage, backups, and updates;
- hosted dashboard access;
- synchronization across the dashboard, npm widget, and browser extension;
- project collaboration and shared pins;
- internal members and unlimited guests;
- project invitations;
- GitHub, Linear, and Jira integrations;
- agent handoff;
- email notifications;
- Product Audit credits;
- billing management through Stripe Checkout and Customer Portal;
- read and export access after cancellation or expiration.

Cloud Studio initially differs from Cloud Pro by capacity, not by withholding essential workflow features.

## 6. One entitlement across every surface

Billing belongs to the project owner. The owner's plan governs every project they own and every CRRT client that accesses those projects.

- The hosted dashboard, npm widget, extension, and API use the same server-side entitlement decision.
- A comment counts once regardless of whether it originated in the widget, extension, dashboard, or API.
- Members and guests never need separate subscriptions.
- A user who owns projects and also participates in somebody else's projects consumes capacity only for the projects they own.
- Client-side controls are explanatory only. The API is authoritative and must enforce every limit.
- Self-hosted deployments bypass CRRT Cloud commercial entitlements.

The extension is included in Cloud Pro and Cloud Studio. It is not sold as a separate subscription.

## 7. Usage definitions

### Projects

A project counts against the owner's plan as soon as it is created or a local extension project is imported into Cloud. Deleting a project reduces the current project count. Historical usage is not used for this limit.

Creating or importing a project is blocked when the owner is already at the plan limit.

### Internal users

Internal users are unique people with the `owner`, `admin`, or `member` role across all projects owned by the billing owner.

- The owner counts as one internal user.
- The same person in several of the owner's projects counts once.
- Pending invitations for an internal role reserve one internal-user slot.
- A declined, revoked, or expired invitation releases its reserved slot.
- Guests do not consume internal-user capacity.

Adding or promoting an internal user is blocked when no slot remains. Existing access is never removed automatically because the account reached a limit.

### Guests

Guests are free and unlimited in both Cloud plans. They may participate only through guest capabilities; changing a guest to an internal role requires available internal-user capacity.

### Comments

The comment allowance counts newly created or imported Cloud comments during the owner's current monthly billing window.

- Widget, extension, dashboard, and API comments share the same allowance.
- Editing, resolving, reopening, or changing the status of an existing comment does not consume another unit.
- Deleting a comment does not restore the consumed unit.
- Historical comments remain readable and exportable and do not count again in future months.
- Local-only extension comments do not count until imported or synchronized to Cloud.
- The allowance resets at the start of the next monthly billing window.

When the allowance is exhausted, CRRT rejects new Cloud comments with a stable machine-readable plan-limit error. Existing comments and non-creating actions remain available according to subscription state and project permissions.

### Product Audits

A Product Audit consumes one credit when CRRT accepts it for execution.

- A duplicate request resolved through the same idempotency key does not consume another credit.
- An internal CRRT failure before a usable result releases the credit.
- A user cancellation after execution begins consumes the credit.
- Credits reset at the start of the next monthly billing window.
- Unused credits do not roll over.
- CRRT does not charge automatic overages in the first release.

After the allowance is exhausted, the owner must wait for the next billing window or upgrade from Pro to Studio.

## 8. Trial and billing lifecycle

### Trial

- Cloud Pro and Cloud Studio each provide a 14-day trial of the selected plan.
- A payment method is collected before the trial starts.
- The account is not charged until the trial ends.
- Canceling during the trial prevents the first charge.
- Trial usage is subject to the selected plan's normal limits.
- Repeated trials for the same billing owner are not allowed.

### Active subscription

An active subscription permits new operations within the plan's limits. Stripe subscription state is synchronized by signed webhooks and server-side reconciliation; browser state never grants access by itself.

### Past due

A short payment-recovery period may keep existing projects operational while Stripe retries payment. CRRT must clearly show the billing problem to the owner. The exact retry schedule follows the Stripe subscription configuration rather than client-side timers.

### Canceled, expired, or unpaid

When paid access ends:

- existing Cloud data remains readable and exportable;
- no projects, comments, invitations, integrations, or Product Audits can be created;
- existing members and guests are not silently removed;
- CRRT does not delete data as an immediate consequence of cancellation;
- restoring an active subscription restores writes, subject to plan limits.

Data-retention and eventual deletion policy must be communicated separately in CRRT's legal and support documentation before production launch.

## 9. Limit behavior

Limits are enforced without destructive side effects:

- Never delete projects, comments, members, screenshots, or audit results to make an account fit a lower plan.
- Preserve read and export access whenever authentication and project permissions allow it.
- Block only the operation that would exceed a limit.
- Return a stable reason identifying the constrained resource: `projects`, `internal_users`, `comments`, `product_audits`, or `subscription`.
- Show current usage, limit, reset date where applicable, and the action needed to continue.
- Apply the check atomically on the server so concurrent requests cannot exceed a limit.

Downgrading from Studio to Pro is allowed even when current stored usage exceeds Pro limits. The account becomes read-only for only the over-limit resource until usage falls below the new limit or the owner upgrades again. Existing data and memberships remain intact.

## 10. Positioning summary

- **Community:** Run the complete product on your own infrastructure for free.
- **Cloud Pro:** Managed CRRT for freelancers and small teams.
- **Cloud Studio:** Higher-capacity managed CRRT for agencies working across many clients.
- **Extension local mode:** Try CRRT privately in one browser, then import the work when moving to Cloud or a self-hosted instance.

“Paid only” means managed CRRT Cloud service. It does not mean that CRRT removes equivalent capabilities from the open-source self-hosted product.