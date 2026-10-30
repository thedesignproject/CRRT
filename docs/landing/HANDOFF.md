# Landing review handoff

Review order for Pranav: [#351](https://github.com/thedesignproject/CRRT/pull/351), then [#352](https://github.com/thedesignproject/CRRT/pull/352). Read AGENTS.md before editing.

## Stack and scope

1. **#351 — design-system foundations**, based on trunk: landing primitives, component metadata, and scoped theme preferences. Defaulting the landing to light does not change dashboard theme preferences.
2. **#352 — landing**, based on #351: the complete reviewed page, real local widget demo, agent setup CTA, capture videos, pricing presentation, and supporting public docs.

Both layers include trunk 6bb4cb32, including MCP and the shared agent onboarding guide (#362). The stack is for code and product review; merging or launching remains a separate decision.

Related work is deliberately not included:
- **#363** changes dashboard MCP onboarding only. Its setup prompt matches the landing prompt, and Git's merge simulation reports no conflicts with this stack. It can be reviewed independently.
- **#350** implements CRRT Record. The landing labels Record as private preview and does not imply general availability.
- **#346** contains Storybook work; this landing uses the existing install destination.

## Accepted page and interactions

- Preserve the photo/video hero, floating glass comments, and two-line headline: “Humans give feedback. Agents ship the fix.”
- The main hero CTA is **Try it live**. It scrolls to the existing workflow scene and activates the real widget. There is no separate demo module.
- **Connect your agent** sits below the main CTA as a smaller text action with monochrome agent logos. It is not a second boxed hero button. In integrations it uses the standard secondary DS button, with 32 px above it and 20 px before its helper text.
- The agent CTA copies the full setup prompt pointing to https://crrt.ai/get-started.md and https://crrt.ai/api/mcp/v1. Copy success explains the next step; clipboard failure reveals selectable instructions. It does not authenticate or execute work itself.
- Navbar: How it works, Pricing, Docs, GitHub; signed-out action **Get started**, signed-in **Dashboard**.
- The journey heading belongs in the left narrative column above its current step. It must not become a detached full-width heading.
- The story follows one comment through pointing, agreement, agent context, and human review. The track is 1100vh, with 900 ms minimum beat spacing.
- The horizontal reel shows Widget, Chrome, Storybook, and Record. Desktop track is 1000vh, with 1800 ms minimum frame spacing and two extra final hold slices. Mobile uses a native horizontal snap scroller.
- Capture videos sit in rounded review frames with a thin border and subtle shadow. Clips play only while on screen.
- The integrations diagram is a preview. Hover, focus, and click change the example destination; they do not send feedback.
- Use the existing DS and landing type tokens. Preserve the accepted hierarchy instead of introducing new pill/button treatments.
- Closing: “Your next fix starts with a comment.” Primary **Get started**, secondary **Add to Chrome** with the Chrome logo.

## Product consistency

| Surface | Current behavior |
| --- | --- |
| Live demo | Real selection, screenshots, comments, editing, and deletion; comments stay in this tab with session storage and an in-memory fallback. No shared project writes or account required. |
| MCP | Account consent and project permissions remain enforced by the existing backend. The landing copies the same onboarding instructions as dashboard, using production URLs. |
| Record | Private preview. Recording/transcription are distinct from authenticated agent access. |
| Pricing | Default monthly: Pro $19 and Studio $49. Annual totals remain $192 and $492. These match api/_lib/billing/plans.ts; no Stripe amount or entitlement change. |
| Checkout | Existing duplicate-request guard, stale-session handling, and authenticated checkout destinations are retained. |
| Themes | Landing and dashboard preferences remain scoped separately. |

## Review notes before launch

- The Widget and Chrome clips show an earlier pricing layout. Other recordings can also contain annual prices from that recording; these are recorded product footage, not the current checkout selector. Re-record if launch requires every frame to match the final page.
- Reviews contains one real verbatim quote from @devonlamond and two invented layout examples (Sofia Bennett and Lucas Reed). The local visual review removed their visible labels; these are not verified customer endorsements. Replace them with approved quotes before a public launch.
- Studio's proposed $39 price was not approved as a billing change. Do not advertise it while checkout still uses $492/year.
- The Chrome URL uses VITE_CHROME_EXTENSION_URL when configured and otherwise falls back to /support#extension.

## Files and preview

- apps/landing/MarketingPage.tsx: composition.
- apps/landing/sections/Hero.tsx and components/ConnectAgent.tsx: entry actions.
- apps/landing/lib/demoComments.ts and tryCrrt.ts: local demo.
- apps/landing/sections/FeedbackJourney.tsx, feedback-journey.css, InstallPaths.tsx, capture-reel.css: scroll narratives.
- apps/landing/marketing-polish.css: final overrides; loads after globals.css.
- apps/landing/sections/Pricing.tsx: presentation, preserving checkout behavior.
- scripts/preview-public-site.ts: built-page preview; includes SVG MIME type for agent logos.
- THIRD_PARTY_NOTICES.md: agent-logo attribution and license.

Run:

    node scripts/build-landing.ts
    PORT=5401 bun run preview:landing

Visit http://127.0.0.1:5401/?stay=1. The query keeps signed-in users on the marketing page. Rebuild after edits; this server serves built assets. API-backed flows require the deployed preview.

## Validation and review path

Run typecheck, landing build/prerender, and the full coverage suite. Locally, NODE_OPTIONS=--no-experimental-webstorage avoids Node 26 storage conflicts with the test DOM. Validate 100% line and branch diff coverage independently: #351 against trunk, #352 against #351.

Manual review at 1440, 1100, and 390 px:
1. Try it live → select an element → send a comment → edit/delete it; reload to verify per-tab persistence.
2. Connect your agent → copy prompt; reject clipboard access to inspect fallback.
3. Scroll forward and backward through all four journey modules and capture clips; verify the last clip holds.
4. Check the navbar, headings, video frames, integration CTA spacing, Chrome logo, and mobile overflow.
5. Toggle monthly/yearly pricing and inspect the unauthenticated destinations without starting a purchase.
6. Compare dashboard MCP onboarding separately in #363.
