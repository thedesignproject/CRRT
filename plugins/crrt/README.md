# CRRT

CRRT turns visual website feedback into reviewed fixes. This plugin connects
Claude to your CRRT account so you can browse projects, read feedback with its
screenshots and page context, prepare selected items for implementation, report
progress, and work with documents, recordings, audits, team access, and
integrations.

## What it includes

- **CRRT MCP server** (`.mcp.json`): the remote server at
  `https://crrt.ai/api/mcp/v1`, using Streamable HTTP.
- **`feedback-to-fix` skill**: guidance for finding Ready for Agent feedback,
  preparing tracked work, reporting progress, and leaving review decisions to
  people.

## Sign-in and permissions

The first time a CRRT tool is used, Claude opens CRRT's OAuth sign-in in your
browser. CRRT never asks for your password in the conversation. The connection
requests read, implementation, review, and dashboard scopes. Every action still
follows your project roles, ownership, and plan, and changes require your
request. You can revoke the connection at any time from the MCP connections page
in your CRRT dashboard.

## What it sends and fetches

The plugin runs no local code. All requests go to `https://crrt.ai` over HTTPS:

- Tool calls you or Claude make, with their inputs (for example project IDs,
  feedback IDs, document text you ask Claude to save, or progress summaries).
- Responses from CRRT, which can include feedback text, screenshot references,
  page URLs, document content, recording transcripts, and project member names.

Billing is not available through the plugin; manage your plan in the CRRT
dashboard.

## Links

- Website: https://crrt.ai
- Support: https://crrt.ai/support
- Privacy policy: https://crrt.ai/privacy

Licensed under the Apache License 2.0.
