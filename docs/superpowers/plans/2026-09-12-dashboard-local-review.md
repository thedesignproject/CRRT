# Dashboard refresh — review record

## Start

From this worktree run `bun run dev:dashboard:preview`, then open
http://127.0.0.1:4327/dashboard/. This serves the actual React dashboard with existing
fixture data. Supabase and API settings point to localhost with a dummy key, not production.
External integration operations require a test backend and are not live in this preview.

## PR 1 scope

- Self-hosted Figtree, white/neutral surfaces and scoped orange action tokens.
- Light default, valid dark preference preserved; fix the old class/data-theme mismatch.
- Responsive project sidebar, retained personal comments, search, settings and administration.
- Readable list without faded/struck-through resolved body text.
- Body before image visually, review actions above, Open page beside capture context.
- Explicit Integrations entry point with provider names, preserving the existing provider picker,
  issue preparation, creation and sync UI. Direct provider buttons/logos remain a polish item.
- Existing live agent workflow remains available; selected-comment export is isolated in the stacked PR.
- Project settings and super-admin actions live at the bottom of the sidebar without changing permission checks.

## Verification gates

- Run dashboard tests, the full repository suite, typecheck, the dashboard build and the complete package build.
- Require 100% changed-line and changed-branch coverage against the current `origin/trunk`.
- Verify the five feedback states, including Ready for testing, after every integration with trunk.
- Inspect desktop, tablet, mobile, 200% zoom, keyboard focus and reduced motion when a browser is available.

## Still pending / review boundaries

This PR intentionally leaves selected-comment agent export to the stacked handoff PR. Open page
does not claim to focus a pin because no receiver contract exists yet. The fixture preview must not
be treated as authenticated production acceptance. Mobile keeps the approved stacked list/detail
layout; drill-in navigation remains a separate product change.

## PR 2 scope: selected feedback handoff

- Right-side modal drawer that does not resize the workspace.
- Selection remains independent from review and implementation status, persists across filters and resets across projects or views.
- Clipboard export contains exactly the selected, currently authorized comments and never mutates their statuses.
- Tests cover successful copy, denied clipboard access, removal, Escape and backdrop dismissal.
- The snapshot is local-only: it does not create a live session, start an agent or synchronize CRRT statuses.
- Authorized feedback views expose Agents even with zero selected comments; the selected agent persists while the dashboard remains mounted.
- Agents is anchored in the workspace toolbar before Run audit; its short count animation respects reduced-motion preferences.
- The action palette uses ink for primary controls, orange for accents, a warm row hover and a neutral open-row state.
- Feedback rows remain flat; agent selection uses an independent checkbox with a visible in-row focus treatment.
