# @crrt/ui

CRRT's Studio design system: tokens, a few Base UI primitives and the CRRT
patterns the dashboard is built from.

Read [`brain/design/DIRECTION.md`](../../brain/design/DIRECTION.md) before adding
anything. Color and type live in [`brain/design/foundations/`](../../brain/design/foundations/).

## Layout

```
src/tokens/tokens.css    Raw Studio tokens (oklch). The only place colors are defined.
src/styles/globals.css   Maps tokens to the Tailwind v4 theme. Dark-first.
src/lib/utils.ts         cn()
src/components/          Base UI primitives: button, input, kbd.
src/crrt/                CRRT patterns (AppShell, PromptBlock, CommentRow…). Import from "src/crrt".
scripts/lint.mjs         Anti-slop lint: no raw hex, no arbitrary spacing, labelled icon buttons.
```

## How the dashboard uses it

`apps/dashboard` imports this package's source directly (no build step). That is
why `src/` never uses an `@/` alias: the dashboard owns `@`. Keep imports relative.

## Commands

Run from `packages/ui`. The package has its own lockfile and CI job, like
`packages/crrt-storybook`.

```sh
bun install
bun run storybook   # http://localhost:6007
bun run typecheck
bun run lint
bun run test:coverage
```

Set `STORYBOOK_CRRT_PROJECT_ID` in `.env` (see `.env.example`) to pin feedback on
these stories with CRRT itself.
