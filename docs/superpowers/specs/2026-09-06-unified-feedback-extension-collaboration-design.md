# CRRT Unified Feedback and Extension Collaboration

**Date:** 2026-09-06
**Status:** Approved design, pending implementation plan

## 1. Summary

CRRT will treat feedback captured by the embedded npm widget and the Chrome extension as the same product object and the same workflow. The two clients differ only in how they discover project context:

- the npm widget receives its project at installation time;
- the extension resolves the current site to one of the signed-in user's accessible projects, while retaining private capture when no project applies.

Project feedback appears in the same dashboard, can be reviewed by the same team, and can follow the same Agent or external-tracker handoff. An invited client can install the extension, open a site that has no CRRT code installed, see the project's shared pins, and leave new feedback. Internal decisions and execution controls remain private to the delivery team.

## 2. Product principles

1. **One feedback model, two capture surfaces.** Source identifies where feedback came from; it does not create a separate product workflow.
2. **No technical setup for clients.** A client accepts an email invitation, signs in once with a magic link, installs the extension, and comments.
3. **Fast when context is certain, explicit when it is not.** A unique domain match preselects the project. Ambiguous matches are never guessed.
4. **Human-controlled execution.** CRRT never sends work to an Agent or external tracker without an internal team member confirming it.
5. **Privacy is visible.** Shared and internal feedback are distinct, and the active audience is visible before submission.
6. **Provider credentials stay server-side.** The browser extension never stores Linear, Jira, or GitHub credentials.

## 3. Roles and permissions

CRRT adds a `guest` project role for clients and other feedback contributors. The existing project owner remains an admin with the owner flag.

| Capability | Owner / admin | Member | Guest |
| --- | --- | --- | --- |
| View shared feedback | Yes | Yes | Yes |
| View internal feedback | Yes | Yes | No |
| Create shared feedback | Yes | Yes | Yes |
| Create internal feedback | Yes | Yes | No |
| Edit or delete own open feedback | Yes | Yes | Yes |
| Review, reject, or mark ready | Yes | Yes | No |
| Operate Agent workflow | Yes | Yes | No |
| Send or assign external work | Yes | Yes | No |
| Configure domains and integrations | Yes | No | No |
| Invite or remove collaborators | Yes | No | No |

Guest-created project feedback is always `shared`. Members and admins choose `shared` or `internal`; the current choice must be visible in the composer. An API permission check, not a hidden client control, enforces every restricted action.

Feedback submitted through the public npm widget is `shared` by default. An internal audience is available only in an authenticated internal-member context.

## 4. Invitation and first-run experience

1. An admin invites a client to a project as a guest.
2. CRRT emails a project-specific invitation link.
3. The invitee authenticates with an email magic link and accepts the invitation.
4. If the extension is missing, CRRT directs the invitee to its Chrome Web Store listing and then returns them to the project/site instructions.
5. The extension receives the authenticated CRRT session and accessible-project list. It never receives an integration provider token.
6. When the invitee opens a registered project domain, the extension selects that project automatically and shows its name in the side pane.

Revoking the guest's membership immediately removes project access on the next API request and clears the extension's active project when it can no longer be loaded.

## 5. Project resolution in the extension

The extension resolves project context using normalized hostnames from the project's existing allowed-domain configuration. The UI presents project names; users never paste a raw `project_id`.

- **One accessible match:** preselect it and show `Sharing with <project>`.
- **Multiple accessible matches:** use the user's remembered choice for that hostname when it remains valid; otherwise require selection.
- **No accessible match:** default to `Private` and offer a project selector containing only accessible projects.
- **Manual change:** allow switching project or choosing `Private` before submission.

Only projects the authenticated user can access participate in matching. A hostname match is a convenience signal, never authorization. Server-side membership checks remain authoritative.

The extension remembers hostname choices locally by opaque project key. A removed membership or domain invalidates the remembered choice.

## 6. Unified feedback model

The existing `comments` record remains the canonical feedback object. The implementation extends its current extension constraints instead of copying comments between private and project-specific tables.

Required concepts:

- `source`: `widget` or `extension`;
- nullable `project_id`: null means personal feedback; non-null means project feedback;
- `created_by_user_id`: required for extension feedback;
- `visibility`: `shared` or `internal` for project feedback; personal feedback is implicitly private;
- normalized page identity and hostname;
- element/text anchor, coordinate fallback, viewport, screenshot, and author;
- review and implementation status;
- zero or more durable external-work links.

External work is normalized into a child collection rather than adding one set of columns per provider. Each link records provider, destination, external identifier, URL, assignee snapshot, creation state, idempotency marker, and timestamps. Existing GitHub issue fields are migrated or bridged compatibly while the shared provider service rolls out.

Assigning existing private feedback to a project updates the same record after membership and visibility validation. It preserves the comment ID, screenshot, anchor, history, and author. The operation must not duplicate feedback.

The current database check that requires every extension comment to have `project_id = null` must be replaced with checks that allow authenticated extension feedback in an authorized project.

## 7. Page identity and pin rendering

The extension both creates feedback and renders existing project feedback over the current page.

- The page overlay shows only feedback for the current normalized page.
- The side pane defaults to `This page` and offers `All project feedback`.
- Route changes in single-page applications trigger project resolution and page-feedback reloads.
- A canonical URL on the same origin is preferred when present. Otherwise CRRT uses origin and pathname, removes the fragment and known tracking parameters, and sorts remaining query parameters.
- Anchoring uses the strongest available evidence: text-range anchor or stable element selector first, then normalized coordinates as fallback.
- When an anchor cannot be resolved safely, CRRT does not place a misleading pin. The side pane shows the feedback as unpositioned with its screenshot and page context.
- When the npm widget is already active for the same project, the extension must not inject a competing toolbar or duplicate pins. It hands focus to the existing CRRT surface while retaining the authenticated extension session for project capabilities.

While the side pane is open, the extension performs a lightweight bounded refresh so collaborators see newly added or changed pins without reloading the website. Opening the extension, changing route, changing project, or manually refreshing always triggers an immediate fetch.

## 8. Shared and internal feedback

The extension filters every response according to the viewer's role:

- guests receive shared feedback only;
- members and admins receive shared and internal feedback;
- personal feedback is visible only to its creator.

Guest-created feedback is shared automatically and the audience is displayed rather than editable. Internal users can choose the audience before posting. Changing shared feedback to internal is restricted to internal members and must update all open extension views on their next refresh.

The dashboard uses the same visibility rules. An internal item cannot leak through counts, notification copy, screenshots, search results, Agent shares, or external-work metadata exposed to a guest.

## 9. Dashboard and Agent workflow

Once extension feedback has a project, it appears in the same project feed as widget feedback. The dashboard may display a source badge for diagnostics, but source does not change available workflow actions.

- Guests cannot operate the Agent and do not receive Agent controls.
- Members and admins can accept, reject, mark done, or choose `Ready for Agent`.
- Agent execution remains in the CRRT dashboard, where repository, Design System, project rules, and implementation state are available.
- The extension may display the current CRRT and linked-work status, but it does not run the Agent.

## 10. Native external integrations

CRRT exposes one shared `Send to...` capability from both the dashboard and the extension side pane. The side pane is a client of a server-side integration service; it does not implement providers independently.

### Providers

- **GitHub:** reuse the existing GitHub App, repository connection, issue creation, idempotency marker, and recovery behavior.
- **Linear:** add a native OAuth connection and issue adapter.
- **Jira:** add a native OAuth connection and issue adapter.

The provider layer uses a common contract for connection status, available destinations, assignees, editable draft fields, creation, and durable result lookup. Provider-specific capabilities may be omitted from a form when unsupported; CRRT does not invent equivalent values.

Project connection records share a provider-neutral envelope while secrets remain in provider-specific server-side storage. The existing GitHub App installation and repository configuration are bridged into that envelope rather than replaced in the first release.

### Setup and use

- Admins connect or disconnect providers in project settings.
- The extension can show `Connect Linear`, `Connect Jira`, and `Connect GitHub` to an admin and open the hosted CRRT setup flow.
- Members see connected destinations and a `Send to...` action. If nothing is connected, they see an admin-contact explanation rather than an unusable connection flow.
- Guests never see connection or send controls. They may see a safe linked-ticket status only if the team later chooses to expose one; that exposure is outside this V1 scope.

### Manual handoff

1. An internal member selects `Send to Linear`, `Send to Jira`, or `Send to GitHub`.
2. CRRT produces an editable draft containing title, description, source URL, screenshot/context link, destination, assignee, and supported priority fields.
3. The member edits the draft and confirms.
4. Confirmation is the human approval: after successful external creation, CRRT marks open feedback `Ready` and persists the external-work link.
5. `Ready for Agent` remains the alternative for implementation through CRRT's Agent workflow.

At most one external item per provider and destination may be created for the same feedback through repeated submissions. Creation uses a durable lease/idempotency marker and recovery lookup so a timeout does not silently create duplicates. A feedback item may link to different providers when a team intentionally needs that, although the UI should emphasize its existing link before allowing another.

## 11. Error and offline behavior

- A failed feedback submission retains the draft and captured context locally and offers retry.
- A failed screenshot upload does not discard the written feedback; CRRT clearly marks the missing screenshot before confirmation.
- An ambiguous domain match opens project selection and never posts automatically.
- An authorization failure removes inaccessible project data from the extension and asks the user to reauthenticate or select another project.
- Failure to create an external item leaves open feedback `Open`. Already-ready feedback remains ready.
- An indeterminate provider response enters recovery state; CRRT searches by its idempotency marker before permitting another creation attempt.
- If a saved pin can no longer be anchored, it remains available in the side pane instead of being rendered at an incorrect location.

## 12. Security and privacy

- All project-comment reads and writes require authenticated membership and role checks in the API.
- Provider OAuth tokens, refresh tokens, installation IDs, and service-role credentials remain server-side and encrypted or protected by the platform secret store.
- The extension bundle contains only publishable client configuration.
- Screenshots use private storage and signed, short-lived delivery URLs.
- Guest queries exclude internal rows at the datastore/API boundary, not only in UI filtering.
- Domain association never grants membership.
- External issue drafts exclude internal-only comments or attachments unless an authorized member explicitly selects that internal feedback for handoff.

## 13. Verification

The implementation is not complete until these stories pass:

1. An admin invites a new guest, who signs in by magic link, installs the extension, opens the registered site, and sees the correct project selected.
2. The guest creates a shared pin. A member opening the same page sees it on-page and in the dashboard.
3. A member creates an internal pin. The member sees it; the guest cannot discover it through page data, counts, search, notifications, or direct API access.
4. A private extension comment is assigned to a project without changing its ID or duplicating its screenshot.
5. An ambiguous or missing domain match never assigns a project without a user choice.
6. A removed guest immediately loses access on the next API request.
7. A member edits a handoff draft, assigns it, and creates a GitHub, Linear, or Jira item. CRRT stores the link and marks the feedback ready.
8. A repeated or timed-out handoff cannot create a duplicate external item.
9. Guests cannot review feedback, run the Agent, configure providers, or create external work even by calling APIs directly.
10. Page navigation reloads the correct pins, and an unresolved anchor is shown safely as unpositioned.

Tests include unit coverage for URL normalization, domain resolution, anchors, role capabilities, visibility, and provider formatting; API integration coverage for authorization, promotion, storage privacy, and idempotency; provider contract tests with deterministic fakes; and extension end-to-end coverage with separate guest and member sessions.

## 14. Delivery slices

The feature should ship as independently reviewable vertical slices:

1. **Project-aware extension feedback:** permit extension comments in projects, add project resolution/selection, preserve personal mode, and unify dashboard display.
2. **Guest collaboration:** add the guest role, invitation acceptance, shared/internal visibility, current-page retrieval, and pin rendering for collaborators.
3. **Shared handoff service:** extract the existing GitHub issue path behind the provider contract and expose the same action to dashboard and extension.
4. **Linear integration:** OAuth, project/team discovery, assignees, editable issue creation, persistence, and recovery.
5. **Jira integration:** OAuth, site/project discovery, assignees, editable issue creation, persistence, and recovery.

Each slice includes migrations, API authorization tests, UI tests, and a reversible rollout. Provider work must not block the core client-feedback collaboration flow.

## 15. Explicitly out of scope

- Running the CRRT Agent inside the extension.
- Anonymous extension collaboration without an accepted invitation.
- Automatic external-ticket creation.
- Generic webhooks or Zapier-style integration frameworks.
- Bidirectional editing or full status synchronization with external trackers.
- Guest access to internal feedback, Agent operations, or tracker controls.
- Replacing the embedded npm widget; it remains the zero-extension capture surface for products that can install it.
