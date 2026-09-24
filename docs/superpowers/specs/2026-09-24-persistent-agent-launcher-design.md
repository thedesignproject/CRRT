# Persistent Agent Launcher

**Date:** September 24, 2026  
**Status:** Approved

## Goal

Keep the **Agents** action visible in the workspace toolbar at all times so the primary handoff feature never disappears when project, view, or permission state changes.

## Behavior

- Render `AgentLauncher` before **Run audit** for every authenticated dashboard state.
- Keep the launcher enabled only when the user is viewing project feedback and the selected project grants `agent:operate`.
- When unavailable, keep the launcher visible but disabled and expose a short reason through its accessible label and native tooltip.
- Preserve the current security boundary: disabled users cannot open the drawer through the launcher, keyboard shortcut, or command palette.
- Preserve the existing selected-comment count and drawer behavior whenever the launcher is available.

## Implementation

- Extend `AgentLauncher` with disabled state and unavailable-reason props.
- Pass the launcher to `Header` unconditionally; use the existing `canOpenAgentPanel` value only to control availability and drawer access.
- Reuse the current toolbar component and design tokens. Do not alter surrounding navbar spacing or introduce a new visual pattern.

## Verification

- Component tests cover enabled and disabled launcher states, labels, tooltip copy, and click suppression.
- App tests confirm the launcher remains visible for users without `agent:operate` while the drawer and alternate opening paths remain inaccessible.
- Header coverage confirms the action remains before **Run audit**.
- Run dashboard tests, type checking, build verification, and the repository diff-coverage checks against `design/dashboard-agent-handoff`.
