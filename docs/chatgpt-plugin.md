# CRRT ChatGPT plugin

The source package is `plugins/crrt`. It uses the existing production MCP at
`https://crrt.ai/api/mcp/v1` and discovers OAuth and dynamic client registration
from that server. The server advertises the complete `crrt:read`, `crrt:implement`,
`crrt:review`, and `crrt:dashboard` scope bundle in its authentication challenge
and discovery metadata. Access remains subject to the
connected account's actual roles, project membership, plan, and user requests.
The package has its own version; it does not change the published widget.

This is a **draft package**, not a submitted or approved plugin. Building a ZIP
does not establish that the live server passes OpenAI review.

## Build and validate

From the repository root:

```sh
python -m unittest discover -s scripts -p test_package_chatgpt_plugin.py
python scripts/package-chatgpt-plugin.py
```

Output: `artifacts/crrt-chatgpt-0.2.3.zip`. The ZIP has `plugin.json` and `mcp.json`
at its root, one workflow skill, and a copy of the existing CRRT favicon. The
packager includes only these four files, rejects symlinks and missing files,
and gives identical inputs reproducible archives. Review notes and credentials
are never included. Update the version in `plugins/crrt/plugin.json` for package
updates; upload the complete rebuilt archive.

Keep `mcp.json` compatible with the portable Agent Plugins schema. Codex's
portable MCP parser rejects the per-server `extensions` field even though OpenAI's
hosted packaging documentation describes it. In v0.2.0 that field prevented the
installed server from appearing in the runtime inventory. The direct build relies
on the standard OAuth challenge and discovery metadata instead.

The default archive configures a direct MCP connection in Codex. Installing the
skill does not establish an OAuth session; authenticate the server through the
client's supported flow and verify the grant with `connection_status`.

For a private package that also works in ChatGPT web, first register and connect
the live server through **Plugins > Add > Add custom MCP server**. Complete DCR
and consent, then verify `connection_status` in a new web chat. Copy its technical
ID from the plugin URL and build:

```sh
python scripts/package-chatgpt-plugin.py --registered-app-id "plugin_asdk_app_YOUR_CONNECTION_ID"
```

This creates `artifacts/crrt-chatgpt-0.2.3-registered.zip`. It uses the supported
Codex compatibility layout: `.codex-plugin/plugin.json`, `.app.json`, and
`.mcp.json`, plus the unchanged skill and icon. The matching `crrt` names let
Codex use the registered connection when available and retain the direct server
as a fallback. The private portable format does not activate registered app
mappings in Codex, so adding only `.app.json` to that format is insufficient.

The connection ID is an account-specific mapping, not an OAuth credential. It is
written only into the generated archive, never the source manifest. Use a
connection owned by the intended account/workspace. Upload the new archive to the
existing personal plugin, then verify **Try in chat**, its connected app, and
its bundled skill. Public submission still uses the publishing portal's separate
MCP setup and review flow.

## Full MCP access

The package uses the same server and tools as other MCP clients. It covers visual
feedback and implementation progress, explicit review decisions, projects, inbox,
members and invitations, domains and access requests, repositories and integrations,
external-work handoffs, notifications, recordings, audits, documents, billing, and
administrator operations where the account has that role. Tool discovery is live;
the package does not maintain a separate reduced tool allowlist.

Existing read/implementation connections do not gain permissions from a ZIP update.
Use the existing dashboard-access consent upgrade or reconnect with the full scope
bundle, then refresh tool discovery. A scope grant does not authorize autonomous
review decisions, publication, sharing, destructive changes, or purchases.

## Blocking work before submission

- Audit the **actual tools returned by `tools/list`**, not just the skill or
  requested scopes. The generic `list_dashboard_operations` and
  `run_dashboard_operation` pair has been replaced with one explicit, annotated
  tool per dashboard operation, with the same capabilities. See
  [plugin-directory-requirements.md](./plugin-directory-requirements.md#progress).
  Dashboard tools still have no tool-level scope, so narrower grants list them
  and receive the upgrade flow when they call one.
- Audit every exposed tool for accurate descriptions, explicit boolean
  `readOnlyHint`, `destructiveHint`, and `openWorldHint`, and minimal returned data.
  Audit billing, subscription, and external-work side effects too. Existing paid
  accounts are allowed; subscription sales and upgrade checkout flows are not.
  `billing.action` (checkout and portal URLs) has been removed from MCP;
  `get_billing_summary` is read-only and billing changes happen in the dashboard.
  Confirm with review that a neutral account-page link is acceptable before
  adding a commerce declaration.
- Publish actual terms at `https://crrt.ai/terms` and verify privacy and support
  pages render their intended content. The privacy policy currently describes
  the extension and dashboard; it needs a publisher-reviewed explanation of MCP
  access, feedback/screenshots and documents returned to ChatGPT, OAuth credentials,
  retention, recipients, and connection revocation. The manifest URLs are intended
  destinations, not evidence those requirements have been completed.
- Test the connection in ChatGPT. Set production `APP_URL=https://crrt.ai` and
  allow only the exact trusted OAuth callback origins shown by the OpenAI flow
  in `MCP_CALLBACK_ORIGINS`. Keep exact redirect matching and PKCE; do not widen
  the allowlist to arbitrary HTTPS origins. Verify refresh, revocation, denied
  access, and the permissions actually granted.

Read-only production checks on November 16, 2026 found both OAuth discovery URLs
responding with JSON. `/terms` did not return a working page. The public fetch of
`/privacy` returned landing-page content, so verify the route's rendered policy
before treating it as a valid listing URL.

Local testing on November 16 established ChatGPT discovery, dynamic registration,
consent, token exchange, and authenticated MCP initialization through an ngrok
endpoint. The Tailscale Funnel endpoint timed out in ChatGPT discovery despite
successful public-relay discovery checks; the reason remains unproven. The browser
connection used read and implementation scopes and linked an existing local
account; no feedback queries were tested through that connection. A later synthetic
connection was upgraded to all four scopes in ChatGPT. Tool refresh and a chat
reload made document tools available. ChatGPT read authorized feedback and team
data, denied the inaccessible project, created/updated/published a private test
document, applied an explicit feedback review decision, and prepared its handoff.
Local database checks confirmed the resulting versions, private sharing settings,
feedback status, and work session. This was a custom MCP connection, not proof of
the bundled skill's installed execution. Local screenshot URLs could not be opened
by ChatGPT, and disabled recordings/billing and disconnected integrations limited
those tests.
A separate direct SDK test with the synthetic local account passed scoped reads,
text-range/screenshot-reference retrieval, selected handoff, accepted-item
preparation, and denial of outsider-project access and unaccepted preparation.
Its diagnostic connection was revoked. These protocol tests do not establish
model behavior, screenshot inspection, or complete installed-skill execution.

## Private web and desktop verification

On November 16, the direct-MCP personal ZIP offered **Open in desktop app**.
Registering a ChatGPT connection initially failed DCR with `invalid_redirect_uri`.
CRRT validates HTTPS callback origins against deployed `MCP_CALLBACK_ORIGINS`.
The publisher added `https://chatgpt.com` while preserving the existing Grok
origin, then redeployed. The observed callback was
`https://chatgpt.com/connector_platform_oauth_redirect`. Exact registered redirect
matching, PKCE, and issuer checks stayed enabled.

The first saved connection then returned **Connector not found** from ChatGPT's
OAuth-start endpoint, and its Settings link failed to load. A fresh private
connection completed discovery, DCR, consent, token exchange, and an authenticated
web `connection_status` check. The user explicitly approved all four live scopes.
No additional CRRT server code change was required.

The existing personal CRRT plugin was updated to the registered v0.2.2 package.
Its website listing showed **Try in chat**, one connected app, and one bundled
skill. A new web chat invoked that package, requested the bundled skill, and
successfully returned the connection's approved dashboard bundle and all four
scopes. Project contents were not requested and no writes were performed.

The actual Windows desktop binary also loaded installed v0.2.2 and discovered all
31 CRRT tools through the registered app route. A direct `connection_status` call
through that desktop runtime returned no error, all four scopes, and approved
`dashboard-v1` access. Registered routing intentionally replaces the separate
`crrt` server in the runtime inventory; its tools appear through `codex_apps`.

This verifies web invocation and desktop runtime compatibility for the private
registered package. It does not establish full workflow coverage or public
submission eligibility. Raw diagnostic records and the pre-change v0.2.1 package
are preserved under ignored `artifacts/`; no secrets are included in the ZIP.

## Review preparation and publishing

1. Use an OpenAI organization with a verified publishing identity and Apps
   Management Write permission. Confirm the final publisher name matches the
   manifest. Select a supported project; current docs exclude EU data-residency
   projects from MCP submissions.
2. Create a dedicated demo account with a project named **Plugin Review**, at
   least two accepted ready items with screenshots and text-range context, an
   unaccepted item, and a completed item. Use sample data and no customer data.
   Provide sign-in without MFA, email codes, or private-network dependencies.
3. Run all bundled positive and three negative cases in `plugin.json` against that
   account in supported ChatGPT/Codex surfaces. Record actual results separately.
   A prompt in the package is a proposed test case, not proof that it passed.
4. Record an accessible walkthrough and set
   `extensions.com.openai.review.demo_recording_url` to its real URL. Enter private
   reviewer credentials separately in the portal. Keep them out of Git and ZIPs.
5. Confirm country availability with the publisher. The package deliberately
   leaves country targeting unset; select it before publication.
6. Upload the ZIP at <https://platform.openai.com/plugins> using **With MCP**.
   Complete the domain challenge at the exact portal-provided
   `/.well-known/openai-apps-challenge` URL. Do not invent or prefill a token.
7. Connect OAuth, scan the live tools, resolve required findings, submit for
   review, and publish the approved version. Verify its directory listing before
   describing it as published. Approval and publication are separate actions.

## Official references

- [Portable plugin packaging and OAuth configuration](https://developers.openai.com/plugins/build/plugins)
- [Submission, listing fields, and required review materials](https://developers.openai.com/plugins/deploy/submission)
- [Public tool exposure, privacy, and commerce requirements](https://developers.openai.com/plugins/plugin-guidelines)
- [Remote MCP review requirements](https://developers.openai.com/plugins/deploy/app-review)
