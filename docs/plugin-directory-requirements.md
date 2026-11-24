# Plugin directory requirements

What CRRT must change, or prepare, before its MCP server and plugin can be
publicly listed in each AI assistant's directory. Researched November 17, 2026.
Re-check the linked sources before submitting, because these programs change often.

Shared starting point: the remote MCP server at `https://crrt.ai/api/mcp/v1`
(Streamable HTTP, OAuth 2.0 + PKCE) and the package in `plugins/crrt/`.

## Overlap across directories

Fixing these once satisfies both OpenAI and Anthropic:

| Work item | OpenAI | Claude |
| --- | --- | --- |
| Replace the generic `list_dashboard_operations` / `run_dashboard_operation` pair with explicit tools | Required | Required in practice (split read/write; no catch-all executors) |
| `title` + `readOnlyHint` / `destructiveHint` (+ `openWorldHint` for OpenAI) on every tool | Required | Required |
| Narrow, accurate tool descriptions with no behavioral instructions | Required | Required |
| Minimal response data | Required | Required |
| Commerce: no subscription sales or checkout (`billing.action`) | Required | Required (no autonomous financial transactions) |
| Working `/terms` and `/privacy` that cover MCP data | Required | Required |
| Demo account with sample data that stays valid through review | Required | Required (Verified review) |
| At least 3 example prompts | Required | Required |

## Progress

Done locally on Nov 17, 2026 (uncommitted):

- **Explicit tools.** The generic executor pair was replaced with one tool per
  allowlisted operation, built from `server/mcp/dashboard-operations.ts`:
  - 74 dashboard tools plus the existing tools, 103 in total with every scope.
  - Each tool has a title, a typed input schema, and explicit `readOnlyHint`,
    `destructiveHint`, `idempotentHint`, and `openWorldHint`.
  - Names are snake_case and 64 characters or fewer.
- **Behavior kept the same.** The handlers, `userRequested` and idempotency rules,
  retry receipts, Record pagination, and the permission-upgrade flow for older
  read-only grants are unchanged.
- **Titles on existing tools.** Every tool now has a title, including the feedback,
  document, and connection tools.
- **Billing.** `billing.action` (checkout and portal URLs) was removed, and
  `get_billing_summary` is read-only. See [Billing decision](#billing-decision).
- **Text updated.** The skill, `plugin.json` review test case, `docs/MCP.md`, and
  the landing page's `get-started.md` now use the new tool names.
- **Verified.**
  - Typecheck and the full test suite pass on Linux in Docker.
  - The local DB integration suite passes (38 tests), covering the upgrade flow,
    writes and idempotent replays, role boundaries, Storybook recovery, and
    GitHub verification.
  - A real MCP SDK client can list and call every tool.
  - Diff line and branch coverage is 100% against trunk.

Second pass, also local:

- **Descriptions.** Every tool description now states what the tool does and its
  preconditions, without telling the model how to behave. The workflow guidance
  moved into the MCP server `instructions` and the `feedback-to-fix` skill. That
  guidance covers: changes only on the user's request, read before write, passing
  the full implementationPrompt to subagents, preferring the browser flow for
  document passwords, and billing being dashboard-only.
- **Super-admin tools.** `admin_list_users`, `admin_list_projects`, and
  `admin_get_stats` are listed only for accounts with the super-admin role. A failed
  role lookup hides them. `get_admin_status` stays visible to everyone.
- **Response data (MCP layer only, so the dashboard is unchanged).**
  - Dashboard results drop internal row fields: `github_issue_lease_token` and
    `screenshot_storage_path`, in both naming styles.
  - Unhandled 500 responses return a generic message instead of raw database text.
- **Claude plugin package** in `plugins/crrt/`:
  - `.claude-plugin/plugin.json` (v0.2.3, Apache-2.0, `privacyPolicyUrl`) and
    `.mcp.json` (`type: "http"`).
  - A README that discloses everything the plugin sends and fetches.
  - `claude plugin validate` passes with nothing to report. The ChatGPT ZIP still
    contains only its four files.
  - The ChatGPT `plugin.json` was bumped to 0.2.3 with release notes.
- **Legal pages.**
  - `/privacy`, `/support`, and the new `/terms` are now server-rendered public
    pages with HTML and Markdown, so a crawler without JavaScript sees the policy.
  - The privacy policy gained an "AI assistant connections" section covering
    sign-in, hashed credentials and token lifetime, data returned to assistants,
    the assistant as recipient, tool-call logging, retention, and revocation.
  - **The Terms text and the privacy additions are drafts that need legal review
    before deploy.** The Terms omit a governing-law clause on purpose; counsel
    should add one.

Decided, no change:

- **Narrow-scope connections** still list dashboard tools. Calling one returns the
  one-time upgrade URL, as before. Hiding them would break the in-place upgrade for
  clients that cache tool lists. New directory connections request every scope at
  consent anyway.
- **`get_github_verification` returns `installationToken`.** It is encrypted,
  short-lived, bound to the connection, and `update_repository_settings` needs it.
  Treat it as an intentional opaque capability.

Product-level findings from the response audit, which need a decision because
fixing them changes the dashboard API too:

- `get_document` shows commenters' full email addresses to every reader,
  including people with only link or password access.
- `list_documents` returns `shareKey` to guests and readers.
- Tracker drafts embed a signed screenshot link that never expires
  (`api/_lib/issue-screenshot.ts`).
- Approved document-unlock access tokens are stored in plaintext in
  `document_unlock_requests`.
- `list_dashboard_feedback`, `export_project_feedback`, and the recording playback
  and agent-context tools return whole result sets. The 128 KB MCP response cap and
  `resultPage` keep responses bounded, but the handler still builds the full result.

Still open (needs production access or people):

- **Production OAuth.**
  - Set `APP_URL=https://crrt.ai` and `MCP_CALLBACK_ORIGINS` to the exact OpenAI
    and Claude callback origins.
  - Verify refresh, revocation, and denied consent against production.
- **Deploy and check pages.** Deploy this branch, then check that `/terms` and
  `/privacy` render with `curl -H 'Accept: text/html'`.
- **Demo account.** Create a "Plugin Review" project with sample feedback, a
  document, and a recording, on a plan that enables recordings and audits so every
  tool works for reviewers.
- **Repackage the private ChatGPT plugin.** After deploy, repackage and reinstall
  v0.2.3, because v0.2.2's bundled skill uses the old tool names.
- **Submit.** Publish the plugin repository and submit through each portal.

## Billing decision

Billing happens only in the CRRT dashboard. The plugin may point users there with
a static link, and it never starts a purchase.

### What OpenAI allows

From the [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines):

- **Allowed:**
  - Signing in to an existing paid account and using the features included in it.
  - Explaining that a feature isn't available on the user's plan.
  - Linking "to an informational page describing available plans or entitlement options."
- **Not allowed:**
  - Linking "directly to a checkout or other transactional page".
  - Linking to "a page that explicitly initiates the process to upgrade, subscribe, or complete a purchase".
  - Displaying subscription plans, starting subscriptions, or promoting upgrades.
  - Advertising pricing, trials, discounts, or promotions.
- **Not addressed:** the guidelines don't mention a general billing or account
  dashboard link. A neutral account page fits the allowed cases, but confirm it
  with OpenAI review instead of assuming it.

### Changes to `server/mcp/dashboard-operations.ts`

- **Remove `billing.action`** from the public tool set. It creates Stripe checkout
  URLs (`action: "checkout"`, `plan`, `cycle`) and billing-portal URLs, which are
  exactly the transactional links OpenAI bans. It also keeps the Claude "financial
  transactions" acknowledgment clearly true. Keeping it only for private MCP
  clients is possible but adds gating complexity, so the default is to drop it everywhere.
- **Keep `billing.summary`** as a read-only tool (`readOnlyHint: true`) that returns
  only the user's own plan and usage, with no plan catalog, prices, or upgrade prompts.
- **When a feature isn't on the user's plan,** return a clear error saying the
  feature isn't included in the current plan, plus the static account link. Give
  the same link whenever the user asks to change billing.
- **Keep the wording neutral,** for example "Billing is managed in your CRRT account:
  https://crrt.ai/…". Never "upgrade to Pro", and never put prices in tool
  descriptions, the skill, or listing copy.
- The link target must be an account or settings page. It must not be a Stripe
  Checkout session or the Stripe Customer Portal.

### Per directory

- **OpenAI:** acceptable as described above, subject to review confirming the account-page link.
- **Claude:** acceptable. The policy bans money or asset transfers and autonomous
  financial transactions; a link to our own domain is neither.

## OpenAI (ChatGPT)

Status: private v0.2.2 works on ChatGPT web and desktop. Details are in
[`chatgpt-plugin.md`](./chatgpt-plugin.md).

### MCP server changes

1. **Replace the generic dashboard executor.** `server/mcp/dashboard.ts` exposes
   `list_dashboard_operations` + `run_dashboard_operation`, which OpenAI prohibits
   because reviewers can't see each operation. Expose each operation (projects,
   inbox, members/invitations, domains, access requests, repositories, integrations,
   external work, notifications, recordings, audits, admin) as an explicit tool
   that keeps the same capability.
   - Those tools have no tool-level scope, so narrower scopes don't hide them.
   - Apply the same check to `server/mcp/dashboard-access.ts` (the consent-upgrade path).
   - Keep existing MCP clients working, and don't narrow the plugin to feedback-only as a shortcut.
2. **Audit every tool returned by `tools/list`.** Each needs an accurate description,
   explicit boolean `readOnlyHint`, `destructiveHint`, and `openWorldHint`, and
   minimal returned data.
3. **Resolve the billing/commerce boundary.** The full bundle includes `billing.action`
   (can create checkout URLs). Existing paid accounts are fine, but subscription
   sales or upgrade checkout inside ChatGPT is not. Restrict it or remove it from the
   public tool set. Audit external-work side effects too. The decision is in
   [Billing decision](#billing-decision).
4. **Production OAuth.** Set `APP_URL=https://crrt.ai`. Put only the exact OpenAI callback
   origins in `MCP_CALLBACK_ORIGINS`, and keep exact redirect matching and PKCE. Test
   refresh, revocation, denied access, and which scopes are actually granted.

### Outside the MCP

5. **Legal pages.** `/terms` doesn't render. `/privacy` returned landing-page content
   on Nov 16. The policy must cover MCP access, feedback, screenshots, and documents
   returned to ChatGPT, OAuth credentials, retention, recipients, and revocation.
6. **Review materials.**
   - A demo account with a **Plugin Review** project.
   - A demo recording URL in `extensions.com.openai.review.demo_recording_url`.
   - Reviewer credentials entered in the portal only, never in Git or ZIPs.
   - The domain verification challenge.

Sources: [submission](https://developers.openai.com/plugins/deploy/submission),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines),
[app review](https://developers.openai.com/plugins/deploy/app-review).

## Anthropic (Claude)

Two separate listings, both submitted at
[claude.ai/directory/manage](https://claude.ai/directory/manage) from any paid
Claude plan:

- **MCP connector:** the remote server. Submit this even if a plugin also uses the server.
- **Plugin bundle:** a GitHub repo containing the plugin with its skill.

After submission an automated policy scan runs and the connector is listed as
**Community** by default. Anthropic may escalate it to **Verified** review, where
a person tests each tool and emails you to ask for test access. Escalations go to
`mcp-review@anthropic.com`.

### MCP server changes (connector)

1. **No catch-all tools.** A tool that accepts both read and write operations is
   rejected. Split by read / create / update / delete. Documenting safe and unsafe
   modes inside one tool's description is not enough. The same dashboard-executor
   rewrite as OpenAI item 1 is needed.
2. **Annotations.** Every tool needs a `title` plus `readOnlyHint: true` or
   `destructiveHint: true` as applicable. The portal flags tools that are missing them.
3. **Tool names are 64 characters or fewer.**
4. **Descriptions describe; they don't instruct.** A description is rejected if it:
   - tells Claude to call other tools the user didn't request,
   - interferes with other tools,
   - pulls behavioral instructions from external sources,
   - hides or encodes instructions, or
   - promotes products.

   Review the current descriptions for "do X before Y"-style guidance and move it
   into the skill.
5. **Errors and size.** Every tool must succeed with valid input. Errors must be
   actionable, not a bare "Internal Server Error". Responses should be proportionate
   in size, with no database dumps.
6. **Data minimization.** Don't collect conversation data beyond what the tool needs,
   even for logging, and never query Claude's memory, chat history, or user files.
7. **Financial transactions.** No autonomous money movement. The same `billing.action`
   decision as OpenAI item 3 applies; see [Billing decision](#billing-decision).
8. **Auth and transport.** OAuth 2.0 with certificates from a recognized certificate
   authority, and Streamable HTTP. Both are already met. Optionally, let Anthropic
   hold the OAuth client by entering its client ID and secret in the portal's
   Authentication step.
9. **Allowed link URIs (optional).** List the crrt.ai origins if any tool opens links
   through `ui/open-link`, so users don't get a confirmation prompt each time.

### Plugin package changes

The current `plugins/crrt/` layout is OpenAI-shaped. For Claude:

- Add `.claude-plugin/plugin.json`. Its `name` must be lowercase and ≤ 64 characters,
  and must not be a reserved word or look like another brand. Set `description`,
  `author`, and `version`, and bump `version` on every release.
- Add `.mcp.json` with `"type": "http"` and `"url": "https://crrt.ai/api/mcp/v1"`.
  The current `"streamable-http"` type value is not accepted.
- Add a `README.md` of at least 40 words, excluding code blocks, that describes
  everything the plugin sends or fetches.
- Add a `LICENSE` file, or set `license` in the manifest.
- No credentials in any file, no symlinks, and no `.DS_Store` or `Thumbs.db` files.
  Keep each file under 256 KiB and include no binaries other than images and fonts.
- Skills need valid YAML front matter whose `description` is a single string.
- Run `claude plugin validate ./plugins/crrt`, then use the portal's **Validate**
  button and fix any **Blocking** findings.

### Outside the MCP

- **Listing fields:**
  - Name up to 100 characters, one-liner up to 200, description up to 2,000.
  - 1–5 categories.
  - Documentation URL, privacy policy URL, support contact, icon, and a permanent slug.
- **Public documentation** must be live by the publish date. A help article is enough.
- **Privacy policy** must cover collection, use and storage, third-party sharing,
  retention, and contact. Same gap as OpenAI item 5.
- **Test account** with sample data, plus at least 3 working example prompts.
- **Compliance step:** seven acknowledgments covering:
  - directory guidelines
  - first-party API
  - financial transactions
  - AI media
  - prompt injection
  - conversation data
  - public docs

Sources: [connector submission](https://claude.com/docs/connectors/building/submission),
[connector review criteria](https://claude.com/docs/connectors/building/review-criteria),
[plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist),
[Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
