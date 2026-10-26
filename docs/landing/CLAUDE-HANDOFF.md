# Landing draft handoff

## Branches and review order

1. `feat/landing-foundations-draft` → `trunk`: shared design-system primitives and scoped theme preferences.
2. `feat/landing-story-draft` → `feat/landing-foundations-draft`: the actual landing and preview-server fix.

Both are drafts for continued design work, not deployment approval. These branches were built from trunk 92739c97. The original local design checkpoint is aa678528 on feat/landing-product-story; do not use that old branch as a PR base because it contains unrelated dashboard/API history.

## Current accepted design

- Preserve the photo/video hero and its floating glass comments.
- Hero copy: “Humans give feedback. Agents ship the fix.” Two lines.
- Light is the default; dark is an explicit, independently persisted landing preference.
- Story: comment with screenshot/context → project/team inbox → integrations or coding agent. No separate configurable-rules step.
- Use carrot assets for feedback pins. Capture navigation uses descriptive icons and Chrome/Storybook logos.
- Capture theatre demonstrates Widget, Chrome, Storybook, and Record through scrolling, with a mobile alternative.
- **Smoked glass is retained ONLY in the integrations diagram.** All other sections reverted to their preceding light treatment. Do not spread dark glass across the page again.
- Integration destinations respond to hover/focus/click as illustrative previews. They do not send real issues.
- Reviews use a compact horizontal carousel.

## Files

- `apps/landing/MarketingPage.tsx`: section composition.
- `apps/landing/sections/FeedbackJourney.tsx` and `feedback-journey.css`: three-step narrative.
- `apps/landing/sections/InstallPaths.tsx`: capture theatre and logos.
- `apps/landing/sections/Integrations.tsx`: interactive handoff preview.
- `apps/landing/marketing-polish.css`: final visual overrides; load after globals.css.
- `branding/crrt/tokens.css`: integrations-only glass tokens.
- `scripts/preview-public-site.ts`: rereads the built manifest per request so rebuilding does not leave stale asset references.

The earlier capture-scroll spec is historical; this handoff records the latest user decisions.

## Local review

Run `bun run build:landing`, then `PORT=5399 bun run preview:landing`.
Visit `http://127.0.0.1:5399/?stay=1`. A query string keeps signed-in users on the marketing page.
Use a free port if 5399 is already occupied.

## Before leaving draft

- Testimonials are fictional illustrative placeholders, explicitly labelled. Replace with verified quotes before public launch.
- Record remains labelled private preview. Its implementation is separate PR #350.
- The local widget may display “Failed to fetch” without a configured API. This design task did not fix or validate that backend integration.
- Preserve current trunk billing behavior: duplicate checkout protection, stale-session request handling, and Stripe billing portal destinations.
- Finish visual review and mobile checks before marking ready.

## Verification

Run typecheck, build:landing, and test:coverage.
For Node versions exposing experimental Web Storage, use `NODE_OPTIONS=--no-experimental-webstorage bun run test:coverage`.
Run diff coverage separately for each PR against its immediate base; follow AGENTS.md.
