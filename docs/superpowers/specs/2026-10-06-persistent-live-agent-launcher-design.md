# Persistent Live Agent Launcher

**Date:** October 6, 2026
**Status:** Approved design; ready for implementation

## Summary

Keep the dashboard **Agents** launcher visible in every authenticated workspace state without replacing CRRT's existing live Agent session. The launcher opens the current `AgentSidebar`, which continues to use `useAgentSession` for server-created shares, prompt generation, presence, events, and implementation progress.

This supersedes PR #287's static selected-feedback drawer. PR #290 will be rebuilt directly on the current `trunk` so it no longer depends on #287.

## Goals

- Keep **Agents** visible in the workspace toolbar before **Run audit**.
- Preserve the existing live Agent session, presence, event polling, and status updates.
- Enable the launcher only when the user is in project feedback, has selected a project, and has `agent:operate`.
- Explain unavailable states without navigating away or exposing feedback.
- Keep the keyboard shortcut and command palette behind the same capability check.
- Rebase the work onto current private-project and feedback-authorization behavior.

## Non-goals

- Replacing the live session with a copied snapshot.
- Adding selected-comment handoff to the dashboard.
- Implementing the premium widget Agent workflow, billing gate, or seat limits.
- Changing Agent API contracts, share scope, polling, or implementation-status ownership.
- Redesigning the dashboard toolbar or Agent sidebar.

## Interaction design

The toolbar always renders one **Agents** launcher. When available, it opens and closes the existing Agent sidebar and exposes `aria-expanded` and `aria-controls`. Its badge shows the current Ready-for-Agent count because that is the queue represented by the live session.

The launcher is disabled when:

- no project is selected;
- the current view is not project feedback; or
- the selected project does not grant `agent:operate`.

The disabled control has a short accessible explanation and a native tooltip. It never opens the sidebar. The `S` shortcut and command-palette action use the same `canOpenAgentPanel` decision so there is no alternate path around the disabled state.

Changing project, leaving feedback, or losing capability closes the sidebar. Returning to an eligible project creates or resumes the existing live session through `useAgentSession`; no private feedback is copied into client-authored prompt text.

## Component boundaries

- `AgentLauncher` owns only toolbar presentation, accessibility state, the Ready count, and its click callback.
- `Header` accepts the launcher as a named action and keeps its placement stable.
- `App` derives `canOpenAgentPanel` and the unavailable reason from current project, view, and capabilities. It remains responsible for sidebar state and keyboard/command routing.
- `AgentSidebar` and `useAgentSession` remain the live handoff implementation and are not replaced or duplicated.

No API, database, billing, or authorization changes are required.

## Error and state handling

- Loading or missing project context fails closed: the launcher stays visible but disabled.
- Session creation and polling errors continue to render inside `AgentSidebar` through the existing error state.
- A project/view/capability change closes the sidebar and prevents stale keyboard or command actions.
- The launcher does not display selected-comment state because this version does not create selection-scoped sessions.

## Verification

- Component tests cover enabled and disabled launcher labels, tooltip copy, badge count, expanded state, and click suppression.
- App tests verify persistent placement, live-sidebar opening, capability gating, project/view transitions, keyboard gating, and command-palette gating.
- Existing `useAgentSession` and `AgentSidebar` tests continue to prove presence, events, and progress behavior.
- Run the complete test suite, typecheck, dashboard build, diff checks, and diff coverage against current `trunk`.

## PR disposition

- Close #287 as superseded by the approved premium Agent workflow and this live-session-preserving launcher design.
- Rewrite #290 directly on current `trunk` with only the persistent-launcher behavior described here.
- Merge #290 after current CI and local verification pass.
