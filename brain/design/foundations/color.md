---
type: "Design Foundation"
description: "CRRT Studio color system: surfaces, carrot, comment status and agent state."
tags: [design, foundations, color]
timestamp: 2026-11-17T00:00:00Z
layer: foundation
load: always
---

# Foundations: Color (Studio)

> Always load this before writing UI. Tokens: `packages/ui/src/tokens/tokens.css`.
> Reference screens: the "CRRT Visual Directions" canvas (Studio: Inbox, Connect, Next steps).

## Idea

CRRT Studio is a dark, professional creative tool. The product under review (screenshots, previews) is the brightest thing on screen. Carrot is a **signal**, not decoration.

## Surfaces

Use `--surface-0` … `--surface-4` for elevation, from canvas up to selected. Show elevation with surface steps plus a 1px `--border`. Do not stack shadows. `--shadow-panel` is used only on the outer app frame and floating panels.

## Carrot: where it may appear

- The **one** primary action per screen (`--primary`, text `--primary-foreground`).
- Pins and the outline around a pinned element (`--pin`).
- Live agent activity: dots, progress bars and the selected-row outline (`--carrot-line`).
- The logo and the quota "growing carrot".

Never use carrot for headings, body text, large backgrounds, secondary buttons or decorative gradients.

## Status colors

Each set has one meaning. Do not mix the sets.

| Set | Tokens | Meaning |
| --- | --- | --- |
| Comment status | `--status-{open,agent,testing,fixed}-{fg,bg}` | Where a comment is in its lifecycle |
| Agent run state | `--agent-{working,paused,done,idle}` | What the agent is doing now. `paused` = needs a human, for example a Brain conflict |
| Next-step tags | `--tag-{copy,layout,behavior}-{fg,bg}` | Kind of change |

Violet always means "the agent". Amber always means "a human must look".

## Rules

- No raw hex values in components. Lint fails on them.
- Text must reach AA, 4.5:1 or better, in both themes. In dark, put dark text on carrot. In light, carrot deepens to `#C2410C` and takes white text.
- Light theme is `[data-theme="light"]` with the same semantic names. Never branch per theme inside components.
