---
name: crrt-connection
description: Recover CRRT MCP connections without duplicate login, dashboard automation, or credential extraction.
---
# Recover a CRRT connection

- Working `connection_status` or `list_projects` means authenticated, even with zero projects.
- Missing tools after successful OAuth is a client tool-loading issue. Use supported refresh or
  restart/new-chat controls, then retry the existing connection. Do not register or log in twice.
- Let the MCP client persist credentials in its secure store and refresh access tokens using
  OAuth. CRRT connections have a bounded 30-day authorization and rotating refresh tokens;
  revocation or expiry can require consent again. Do not promise permanent access.
- A 401 means the client should attempt its supported token refresh. Reauthorize only when the
  client reports that renewal is unavailable/invalid. A 403 or `insufficient_scope` means access
  or consent is missing; check identity, project membership and granted scopes first.
- Timeout, 429, 5xx, or offline is not logout. Respect retry-after, retry transient errors with
  bounded backoff, and report persistent failures rather than opening more login windows.
- Consent may reuse the user's existing CRRT browser session. That session is separate from the
  agent's OAuth authorization. Never copy browser cookies/tokens into the agent or repository.

## Remote terminal or phone (including Moshi)

Use the MCP client's supported remote OAuth flow. Show the authorization link once when the user
must approve on their phone, and preserve the pending attempt. Do not open an automated Chromium
on an inaccessible desktop. A native loopback callback points to the machine running the client:
opening that callback on a different phone cannot reach the remote client. If the client does not
support a remote callback/device flow, explain that specific limitation and use its supported
connection UI or authorized callback relay; never build a credential-scraping workaround or bypass
PKCE. Do not claim CRRT offers a device-code grant (it currently does not).

Reuse persistent MCP configuration and secure credential storage across sessions. Ephemeral
containers must retain the client's supported auth storage to avoid repeated authorization.
Do not assume one agent's authorization is shared with other agents or devices.
