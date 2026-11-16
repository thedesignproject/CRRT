# Send feedback to a listening agent

## Approved behavior

The owner requested a separate SEND action in the widget. Saving feedback remains available without execution. Only authorized project users may send work; anonymous reporters and guests cannot activate a terminal. SEND is explicit permission to implement the selected comment and verify the change, not permission to merge or deploy.

## Delivery choice

Use a persistent queue with a bounded MCP wait tool. An agent starts listening once for a project and a verified repository, then calls the wait tool between jobs. SEND completes that pending tool with the selected feedback. This works through ordinary MCP calls without accessing client internals or introducing a shell-command endpoint. A closed client cannot be awakened by MCP: stale listeners are shown offline. A background runner and client-specific terminal injection are separate approaches and are not required for this first increment.

## Trust and lifecycle

Listeners belong to an authenticated MCP connection and project. Starting one requires implementation access, the current project repository URL, and explicit human intent. By default only its owner may send to it. A project admin can explicitly authorize additional current project members for that listener. All senders must retain feedback-management and agent-operation permissions. Guest/public feedback can be sent by an authorized reviewer.

Each SEND selects one comment with its exact updatedAt, a listener and a stable retry key. A database transaction rechecks sender and executor access, repository, plan, freshness and comment eligibility. It accepts pending feedback as the human's review decision, creates one durable dispatch and records the original content fingerprint. Duplicate clicks and ambiguous retries recover the same dispatch. A second live dispatch for the same comment is rejected.

A listener receives one dispatch at a time. Receipt prepares the existing MCP work session atomically and is repeatable: a lost response returns the same work, never a new execution. The agent must read full context, claim, start, report progress and finish using the existing protocol. Completion remains ready_for_testing. The listener resumes waiting after completion; blocked work requires an explicit decision rather than silently advancing or restarting.

Recheck comment content, human review, sender and executor membership, connection, repository and plan before delivery and each progress write. Stop stale work rather than report success for changed instructions. Queued work survives a temporary disconnect and remains pinned to the same listener. Do not transfer active claims to another executor automatically. Pausing stops further delivery; it does not claim to interrupt a running model or shell command.

## Widget

Reuse the existing Agent dialog and its login/entitlement checks. Add a listening terminal selector and a single-comment SEND action. Show queued, received, working, blocked and ready for testing from server state. Offline is distinct from failure or completion. Keep the manual prompt handoff as an explicitly labeled fallback. Never label a copied prompt as received.

## Stack and acceptance

1. `send/foundation`: additive listener/dispatch storage, transactional authorization/deduplication and real database tests.
2. `send/mcp`: bounded listening, preparation/progress integration, widget API, authenticated transport tests and setup documentation.
3. `send/widget`: SEND, destination/status UI, interaction coverage, visual verification, widget version/changelog.

Verify owner/member/guest/public boundaries, changed retries, simultaneous sends/polls, stale content, revocation, expired/offline listeners, lost responses, wrong repositories, queued recovery, and two consecutive send→receive→claim→start→complete cycles. Test React compatibility, build/typecheck and 100% changed-line/branch coverage per stack layer. Open reviewable PRs; this request does not authorize merging or publishing the new widget release.

## Work checklist

- [x] Explore existing widget/MCP/schema and repository rules.
- [x] Use approved behavior and resolve execution approach; no visual choice requires a separate mockup tool.
- [x] Write and self-review this spec for scope, trust and failure behavior.
- [x] Implement and validate storage layer.
- [x] Implement and validate MCP/API layer.
- [x] Implement and validate widget layer.
- [ ] Open and verify the PR stack.

The optional writing-plans skill is not installed. The layer sequence and acceptance matrix above serve as the implementation plan. Existing user authorization covers proceeding with the agreed design.
