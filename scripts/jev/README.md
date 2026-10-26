# Jev display picker

Routes a natural-language question about feedback comments through
[Jev](https://docs.typesafe.ai) (TypeSafe System One), which picks the dashboard
component that answers it: `MetricCard`, `StatusBreakdown`, `LineChart`, or
`CommentList`. The pick is rendered with deterministic mock data.

Jev's options come from each component's `.meta.ts` (`description`,
`whenToUse`, `whenNotToUse`), so adding a component with meta makes it pickable.

## Setup

Add your key to `.env.local` (git-ignored):

```
TYPESAFE_API_KEY=...
# JEV_MODEL=jev-latest   # optional; pin a version to keep confidence thresholds stable
```

## Use

```bash
bun run jev:preview                                  # preview at http://127.0.0.1:4340/
bun run jev "how many comments have I not resolved yet?"
```

Coding agents get the same flow as the `ask_jev` MCP tool, registered in
`.mcp.json`. Claude Code asks to approve it on first use; restart the session
after approving so the tool loads.

## Files

- `decide.ts`: Jev request (component, comment set, daily trend) and answer validation
- `mock-data.ts`: seeded comments with full status history, and props for each component
- `run.ts`: asks Jev, builds props, writes `preview/selection.json`
- `cli.ts` / `mcp.ts`: command-line and stdio MCP entry points
- `preview/`: Vite page that renders the selection with dashboard tokens
