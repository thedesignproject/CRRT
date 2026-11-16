# CRRT ChatGPT plugin

The source package is `plugins/crrt`. It uses the existing production MCP at
`https://crrt.ai/api/mcp/v1`, dynamic OAuth client registration, and explicit
`crrt:read`, `crrt:implement`, `crrt:review`, and `crrt:dashboard` scopes. The
plugin requests the complete existing MCP capability bundle, subject to the
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

Output: `artifacts/crrt-chatgpt-0.2.0.zip`. The ZIP has `plugin.json` and `mcp.json`
at its root, one workflow skill, and a copy of the existing CRRT favicon. The
packager includes only these four files, rejects symlinks and missing files,
and gives identical inputs reproducible archives. Review notes and credentials
are never included. Update the version in `plugins/crrt/plugin.json` for package
updates; upload the complete rebuilt archive.

The MCP OAuth settings use OpenAI's documented `extensions.com.openai.auth`
fields (DCR and the complete scope bundle). The upstream Agent Plugins MCP
schema currently rejects that vendor extension; validate the standard transport
fields against that schema and the auth settings against OpenAI's reference and
portal checks. Keep the explicit scopes so users can review the intended access.

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
  requested scopes. `server/mcp/dashboard.ts` exposes `list_dashboard_operations`
  and `run_dashboard_operation` without a tool-level scope, and
  `server/mcp/dashboard-access.ts` exposes an upgrade path. Requesting narrower
  scopes does not hide those tools. OpenAI's public guidelines prohibit a generic
  discovery/executor pair for operations not individually exposed for review.
  Replace that public executor with explicit reviewed tools while retaining the
  intended capabilities. Preserve existing clients; do not silently narrow the
  plugin to feedback-only access as a substitute for this work.
- Audit every exposed tool for accurate descriptions, explicit boolean
  `readOnlyHint`, `destructiveHint`, and `openWorldHint`, and minimal returned data.
  Audit billing, subscription, and external-work side effects too. Existing paid
  accounts are allowed; subscription sales and upgrade checkout flows are not.
  The current complete MCP bundle includes `billing.action`, so full private MCP
  access is not itself evidence of public-directory eligibility. Resolve that
  public commerce boundary before submission. The draft omits a commerce
  declaration rather than falsely claiming that the server cannot create checkout
  URLs.
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
account; no feedback queries were tested through that connection. ChatGPT tool execution and
the full-scope connection still require verification with the synthetic account.
A separate direct SDK test with the synthetic local account passed scoped reads,
text-range/screenshot-reference retrieval, selected handoff, accepted-item
preparation, and denial of outsider-project access and unaccepted preparation.
Its diagnostic connection was revoked. These protocol tests do not establish
model behavior, screenshot inspection, or complete installed-skill execution.

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
