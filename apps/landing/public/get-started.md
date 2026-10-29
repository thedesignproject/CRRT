# Set up CRRT for your agent

Connect this agent to CRRT once, then use CRRT tools in your conversations. Setup does not select a project or authorize implementation work.

Perform setup yourself when terminal or file access is available. Pause for the user to sign in and approve OAuth permissions, or for a client UI action you cannot perform. Never ask the user to paste credentials into the conversation.

Use the system's default browser for OAuth. Let the MCP client or CLI open it automatically. A printed authorization URL does not mean the browser failed to open: do not also run `open`, `start`, `Start-Process`, or `xdg-open` on that URL. Wait for the original command and the user to finish. Only open the URL manually if the command explicitly reports that browser launch failed or the user says no browser opened, and do so only once with the operating system's default URL handler. Do not use an embedded browser, web preview, or computer-use session. Do not start another login while an authorization attempt is pending or after it succeeds. If you cannot launch the default browser after a confirmed launch failure, give the user the URL to open once in their default browser.

## 1. Check the current client

Identify the client you are running in and inspect its existing MCP configuration. Reuse an existing CRRT connection when its URL matches. Preserve unrelated servers and settings; do not create duplicate entries or replace an existing connection to a different environment without asking.

Use the MCP server URL supplied with the setup prompt. Otherwise, use `https://crrt.ai/api/mcp/v1`. CRRT uses Streamable HTTP and OAuth. Prefer user-wide configuration so the connection is available across projects.

## 2. Connect using the client's supported method

In the examples below, replace `<server-url>` with the URL from step 1.

### Codex

Inspect existing servers with `codex mcp list`. If CRRT is not configured, run:

```sh
codex mcp add crrt --url <server-url>
```

`codex mcp add` may start OAuth and open the default browser automatically. If it does, wait for that same command to finish; do not separately open the printed URL or run `codex mcp login crrt`. A successful authorization result completes this step. Run `codex mcp login crrt` only if the client explicitly reports that authentication is still required and no authorization attempt is pending. Let that command manage its browser flow as well.

### Claude Code

Inspect existing servers with `claude mcp list`. If CRRT is not configured, run:

```sh
claude mcp add --transport http --scope user crrt <server-url>
```

Ask the user to open `/mcp`, select `crrt`, and choose Authenticate when authorization is needed. Let the user complete browser sign-in and consent.

### Cursor

Inspect `~/.cursor/mcp.json`. Merge the following entry into its existing `mcpServers` object, substituting the selected server URL:

```json
{
  "mcpServers": {
    "crrt": {
      "url": "<server-url>"
    }
  }
}
```

Let the user enable the server and complete OAuth from Cursor's MCP settings when prompted.

### Other clients

Use the client's documented remote MCP setup. Add a server named `crrt` with the selected URL, Streamable HTTP transport, and OAuth authentication. If configuration requires UI access you do not have, give the user the exact next action. Do not claim the client is configured until verified.

## 3. Verify access

Refresh the client's MCP tool list, then call CRRT's read-only `list_projects` tool. A successful response, including an empty project list, verifies authenticated access. Do not select a project or change feedback merely to test the connection.

After the user approves in the browser, check the original login command's result and call the MCP tool. Do not require a second dashboard sign-in or use a browser page as the connection check.

If tools are unavailable, use a supported refresh action only if this client exposes one. Successful OAuth with tools missing from the current chat is a tool-loading issue, not a reason to authorize again. If no supported refresh is available, stop and ask the user to reload the client or start a new conversation, preserving the current task and noting that authentication succeeded but tool verification is pending. After reload, call `list_projects` using the existing connection; do not repeat setup or login unless the client reports an authentication failure.

Keep verification within the client's normal MCP tools and documented connection controls. Do not generate app-server types, create verification scripts or project files, launch another app-server process, probe internal RPC methods, inspect sockets, or search credential stores to force tools into the current chat. A client reload is sufficient as the next step when normal tool refresh is unavailable.

## 4. Continue the conversation

Report the verified client, MCP server URL, and whether `list_projects` succeeded. Continue any existing user-requested task that needed CRRT once its tools are available. If a client reload is required, preserve the task and explain how to resume it afterward using the existing connection, without repeating successful setup or login. Do not promise automatic continuation across a reload or a new conversation. If there is no existing task, say "Connected to CRRT and ready" only after verification succeeds, then wait for instructions. Connecting alone does not authorize new work.

When the user requests feedback implementation, use CRRT's selected-feedback work preparation and its returned implementation instructions. Setup is not an instruction to process all accepted feedback.

## Optional widget maintenance

When the user requests automatic updates for an installed npm widget, follow [the widget update skill](https://crrt.ai/widget-updates/SKILL.md). It configures scheduled update PRs in their repository, with human review by default. Connecting MCP alone does not enable or authorize dependency automation.

## Client documentation

- [Codex MCP setup](https://developers.openai.com/codex/mcp)
- [Claude Code MCP setup](https://code.claude.com/docs/en/mcp)
- [Cursor MCP setup](https://cursor.com/docs/mcp)
