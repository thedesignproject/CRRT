# CRRT session continuity and agent installation

Approved architecture: reusable browser sessions, OAuth MCP connections, shared project operations, and task-specific skills. Implement on an isolated branch targeting trunk. No landing UI changes.

## Findings
- Widget login is React memory only; reloading always discards it. Widget credentials expire after one hour.
- Dashboard already persists and refreshes Supabase sessions. MCP uses PKCE, rotating refresh tokens, 15-minute access credentials and a bounded 30-day connection. Do not replace these mechanisms or claim a client-specific fault without reproducing it.
- MCP has discovery and feedback tools, but no project creation/installation tool.

## Implementation
- Persist only the origin/project/API-scoped opaque widget credential in browser storage, never the dashboard session. Use a bounded seven-day lifetime for new widget credentials; Storybook keeps its existing one-hour lifetime. No indefinite sliding session. Restore after reload, synchronize sign-out between tabs, and clear rejected credentials on authenticated 401s without treating network/403 failures as sign-out.
- Retain existing OAuth renewal and revocation. Add an explicit optional project-creation scope so old connections do not gain new privileges. Expose identity, authorized project installation configuration, and idempotent creation using existing project ownership rules.
- Publish repository skills for setup, feedback work and connection troubleshooting. Setup checks existing tools first, resolves project config, installs and verifies using the user's coding agent. Authentication alone never authorizes implementation or deployment.
- A remote client must persist its own OAuth state and support a callback reachable in its auth flow. Opening a loopback callback on a different phone cannot be made to work by a prompt; document the boundary rather than bypassing PKCE or extracting credentials.

## Validation
Unit and integration coverage for persisted sessions, scope isolation, authorization, retries and project collisions. Existing OAuth refresh tests retained. Typecheck, full suite and 100% diff coverage. No production migration or deployment during development.
