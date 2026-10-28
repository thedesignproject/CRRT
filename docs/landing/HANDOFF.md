# Landing draft handoff

For any agent (Codex, Claude, Cursor) continuing the landing. Read `AGENTS.md` first; this file records the design decisions the user has accepted so far.

## Branches and review order

1. `feat/landing-foundations-draft` → `trunk`: shared design-system primitives and scoped theme preferences (PR #351).
2. `feat/landing-story-draft` → `feat/landing-foundations-draft`: the landing itself (PR #352).

Both are drafts for continued design work, not deployment approval. Built from trunk 92739c97. Do not use the old `feat/landing-product-story` branch as a base; it carries unrelated dashboard/API history.

## Accepted design

- **Hero visual is locked.** The primary button is now “Try CRRT” and scrolls to the live demo before activating the widget. Keep the photo/video hero, its floating glass comments and pins, and the two-line headline “Humans give feedback. Agents ship the fix.” Improve the sections after it.
- **The page should not look generated.** Real product UI and real data over illustrations; no decorative eyebrows, step rails, trays or chips that repeat what the content already says.
- **Story (`FeedbackJourney`)**: one pinned scene follows comment #24 through comment → approve → ship → fixed. CRRT is desktop-first, so the subject is a desktop pricing card that gets fixed (no phone mockup). The side panel mirrors the product panel; keep it product-identical.
- **Capture reel (`InstallPaths`)**: four real clips (Widget, Chrome extension, Storybook, Record), each a 6–9 s recording of CRRT's own UI on CRRT's own sites. Clips sit on the page without a card frame and play only while on screen. Record stays labelled “Private preview”.
- **Scroll pacing (`lib/useScrollSteps.ts`)**: pinned sections walk one step at a time, so a hard flick still plays every step in order (`dwell` ms per step), and the last step holds extra scroll (`hold`) so it is seen before the section unpins.
- **Integrations**: smoked glass is retained only in the integrations diagram. Destinations respond to hover/focus/click as previews; they send nothing.
- **Reviews** are “What people say about CRRT.”: real comments only, quoted verbatim (casing included), as compact cards. Never add invented quotes or handles. Add new ones to `voices` in `sections/Reviews.tsx`.
- **Pricing** follows a centered layout: intro and billing toggle centered; three equal plan cards; Pro carries a “Recommended” tab and the only primary button; price figure beside its two-line billing label; CTA above the feature list; Studio opens with “Everything in Pro”.
- **Type scale** (tokens in `marketing-polish.css`): one semibold weight (600, never heavier) after the hero. `--landing-h2` section titles, `--landing-h3` step and plan titles, `--landing-h4` card titles, `--landing-lead` paragraphs under a section title. Use the tokens; do not set heading sizes per section.

## Files

- `apps/landing/MarketingPage.tsx`: section composition.
- `apps/landing/sections/FeedbackJourney.tsx`, `feedback-journey.css`: the pinned story.
- `apps/landing/sections/InstallPaths.tsx`, `capture-reel.css`: capture reel; clips in `apps/landing/public/capture-*.mp4` with `.jpg` posters.
- `apps/landing/sections/Pricing.tsx`, `pricing.css`; `Reviews.tsx`, `reviews.css`.
- `apps/landing/lib/useScrollSteps.ts`: step pacing shared by the story and the reel.
- `apps/landing/marketing-polish.css`: type tokens and final overrides; it loads after `globals.css`. Section stylesheets imported by components load before both, so a section rule can be overridden by the global sheets at equal specificity.
- `scripts/preview-public-site.ts`: rereads the built manifest per request so rebuilding does not leave stale asset references.

## Local review

Run `bun run build:landing`, then `PORT=5399 bun run preview:landing`.
Visit `http://127.0.0.1:5399/?stay=1`. A query string keeps signed-in users on the marketing page.
Use a free port if 5399 is already occupied.

## Open before leaving draft

- The Widget and Chrome clips were recorded on the previous pricing design; re-record them on the current pricing section.
- Reviews has one real comment (@devonlamond). Add more real ones; confirm permission to quote before launch.
- Live demo feedback uses a session-local adapter with screenshot quota fallback; it never sends comments to a shared project. The real widget supports selection, screenshots, editing and deletion.
- Record's implementation is separate (PR #350) and stays a private preview here.
- MCP is merged from trunk; integrations, pricing, agent docs and llms.txt now describe account authorization and scoped feedback work.
- Preserve trunk billing behavior: duplicate checkout protection, stale-session request handling, and Stripe billing portal destinations.

## Verification

Run typecheck (`bunx tsc -p tsconfig.check.json --noEmit`), `bun run build:landing`, and `NODE_OPTIONS=--no-experimental-webstorage bun run test:coverage`.
Run diff coverage against each PR's immediate base (`bash scripts/check-diff-coverage.sh origin/feat/landing-foundations-draft`); line and branch coverage must be 100% per `AGENTS.md`.
A full-suite run can time out a few dashboard/widget tests under load; rerun those files alone before treating them as real failures.
