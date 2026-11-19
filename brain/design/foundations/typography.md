---
type: "Design Foundation"
description: "CRRT Studio typography: Inter Tight, JetBrains Mono, and VT323 only for agent voice."
tags: [design, foundations, typography]
timestamp: 2026-11-17T00:00:00Z
layer: foundation
load: always
---

# Foundations: Typography (Studio)

| Role | Font | Token | Use |
| --- | --- | --- | --- |
| UI | Inter Tight 400/500/600 | `--font-body` | Everything by default |
| Data | JetBrains Mono 400/500 | `--font-mono` | Selectors, paths, commands, counts, agent step logs |
| Agent voice | VT323 | `--font-crt` | Rare. At most one per screen, and only where the agent "speaks" (live status headline, 404, empty-state easter egg) |

## Scale

- Page title: 28px / 600 / -0.025em
- Section title: 15px / 600
- Body: 14px / 400 / 1.45
- Meta and mono: 12–13px

## Rules

- At most two weights on a screen, apart from page titles.
- Mono text is never the main label of a row. It is metadata under or beside the label.
- VT323 is never used for buttons, navigation, form labels or body text.
