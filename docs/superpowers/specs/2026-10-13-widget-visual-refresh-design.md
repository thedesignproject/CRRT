# Widget visual refresh

## Goal

Make the Agent Bridge immediately legible as a feedback work queue while preserving its current behavior and integrations.

## Approved direction

- Use a compact, quieter modal with Figtree and a restrained type scale: 20px title, 13–14px content, and 11–12px metadata.
- Replace heavy cards with clean feedback rows, lighter separators, and more consistent spacing.
- Treat the bridge as a post-approval handoff: only accepted, actionable comments appear here.
- Keep selection, per-comment tracker results, agent handoff, and retry behavior unchanged.
- Make the footer a clear two-action zone: `Copy for agent` and tracker issue creation.
- Show recognizable Linear, GitHub, and Jira logos with full provider names in the selector; reuse the provider logo in created and failed results.
- Preserve keyboard behavior, accessible names, mobile sizing, and the development-only `/widget-preview` route.

## Verification

- Update component tests for provider identity and retained behavior.
- Run typecheck, focused tests, differential coverage, and the landing build.
- Inspect the local preview at `/widget-preview` at desktop and narrow widths.
