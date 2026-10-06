# Persistent Live Agent Launcher — Implementation Plan

## Objective

Rewrite PR #290 directly on current `trunk` so the Agents action remains visible while the existing live `AgentSidebar` and `useAgentSession` workflow stay intact.

## Steps

1. Add a focused `AgentLauncher` toolbar component with enabled, expanded, disabled-reason, and Ready-count states.
2. Add the launcher as an explicit `Header` action before **Run audit**.
3. Derive one fail-closed `canOpenAgentPanel` decision in `App` and reuse it for launcher, sidebar rendering, keyboard shortcut, command palette, and automatic closure.
4. Preserve the current `AgentSidebar`, `useAgentSession`, prompt generation, presence, events, and status polling unchanged.
5. Add component and application tests for availability, persistence, alternate entry points, and live-session preservation.
6. Run React quality review, complete tests, typecheck, dashboard build, diff checks, and mandatory 100% diff line/branch coverage against `origin/trunk`.
7. Rewrite the remote #290 branch with force-with-lease, retarget it to `trunk`, close #287 as superseded, wait for current checks, and merge #290.
