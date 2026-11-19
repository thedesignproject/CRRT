---
type: "Design Direction"
description: "CRRT visual direction (Studio) and the component inventory it implies, including patterns borrowed from the Inflight teardown."
tags: [design, direction]
timestamp: 2026-11-17T00:00:00Z
layer: foundation
load: always
---

# CRRT visual direction: Studio

Chosen 2026-11-17 over Precision (light, neutral), Signal (warm, editorial) and Rebel minimal (Resend-light).

**In one line:** a dark, pro creative tool (Figma / Raycast / Linear family) where the reviewed product is the brightest thing on screen and carrot marks pins, the one primary action and live agent activity.

## Principles

1. **Agent-first.** The empty state is the agent setup, not a tutorial. The first project is created by the agent, and HTML or URL upload is plan B.
2. **The Brain is visible.** Every next step cites the rule it follows. When a comment contradicts a rule, the agent pauses and the UI asks "keep or update the rule". This is the differentiator against Inflight.
3. **Dense and quiet.** Use rows, not cards. Show elevation with surface steps, not shadows. Don't nest cards.
4. **One metaphor.** The pixel carrot appears in the logo, the quota meter that "grows", 404 pages and empty states.
5. **The agent has a voice.** It uses violet for state, mono for its logs, and rare VT323 for its headline moments.

## Component inventory (build in `packages/ui`)

**Base (from template-ds):** button, badge, input, tabs/segmented, dropdown, dialog, sheet, tooltip, avatar, kbd, toast.

**CRRT patterns:**

| Component | Where | Notes |
| --- | --- | --- |
| `AppShell` + `SidebarNav` | every dashboard screen | surface-1 sidebar, count and live-dot slots |
| `CommentRow` | Inbox | avatar, label, mono `page · selector`, status chip |
| `StatusChip` | Inbox, detail | uses `--status-*` only |
| `PinnedPreview` | comment detail | browser frame, element outline, numbered pin |
| `Thread` | comment detail | |
| `AgentRunCard` | detail, Agent runs | uses `--agent-*` states and mono step log |
| `CommandBlock` | Connect, docs | copy button, `$` prompt |
| `AgentClientTabs` | Connect | Claude Code / Codex / Cursor / Claude / Other |
| `ConnectionStatus` | Connect | pulsing "waiting for `list_projects`…" plus restart hint |
| `UploadDropzone` | Connect, Projects | URL or HTML gives a link |
| `SetupChecklist` | sidebar | connect agent, widget, team, first Brain rule |
| `QuotaMeter` | top bar | agent calls per week, growing-carrot marker |
| `NextStepRow` | Next steps | checkbox, tag, `RuleCitation`, requester |
| `RuleCitation` | Next steps, conflicts | mono `file.md · rule` |
| `RuleConflictCard` | agent pause | quotes the rule, Keep / Update |

## Borrowed from Inflight (teardown 2026-11-17)

- "Create project" means "Connect your coding agent".
- Copy is written for the agent too: `crrt.ai/mcp.md` plus a "Remember this workflow" block for AGENTS.md.
- Comments become AI-grouped next steps that the agent completes live with `complete_next_step`.
- The quota is measured in agent calls and is always visible.
