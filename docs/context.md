# Product Context

> This file is the single source of truth for what this product is, who it's for, and how we talk about it. It informs landing copy, positioning, partnerships, and naming. Update as decisions firm up.

---

## TL;DR

A visual feedback widget that turns ordinary product comments into instructions an AI agent ships.

You see something wrong on any web product → drop a pin → an AI agent (Claude Code, Codex, or your own) picks up the change and ships it.

## Positioning statement

> *For people with taste who don't always have engineering bandwidth, [PRODUCT] is the visual feedback widget where every comment becomes a working code change. Unlike Pastel or Marker.io, the feedback doesn't go to a human queue — it goes straight to an AI agent that implements it.*

## The job to be done (JTBD)

The user already has the taste. What they don't have is a frictionless way to act on it.

Today the path from *"this is off"* to *"it's fixed"* looks like:
1. Notice the issue
2. Open Slack/Linear/Jira
3. Write a description
4. Add screenshots
5. Tag a dev
6. Wait for prioritization
7. Wait for implementation
8. Review the result
9. Often: re-explain because translation got lost

90% of issues never make it to step 9. Their taste evaporates in tickets.

**The JTBD this product hires for**: *let me change a product without writing a ticket, chasing a dev, or context-switching.*

The outcome we sell is **shipped fixes**, not "feedback collection." Every piece of marketing collapses to that.

## Who it's for

- **Designers** with taste but no engineering bandwidth
- **Founders & co-founders** who spot product issues daily but get pulled in 100 directions
- **PMs** who run reviews and want to compress feedback loops
- **Devs** who want a faster signal channel from non-technical teammates
- **Indie creators & entrepreneurs** shipping solo with AI tools who need to maintain product taste at scale

**The unifier**: anyone with taste, any role. We're not segmenting by job title — we're segmenting by *behavior* (people who notice things and want them fixed).

## Why now

Two shifts converged:
1. **AI agents crossed the reliability threshold** for actually implementing specific UI/code changes from natural-language descriptions (Claude Code, Codex, etc).
2. **The friction is now the human handoff**, not the implementation. The bottleneck moved upstream.

Before AI agents shipped real code reliably, we'd be just another feedback tool. Now, the same gesture has 10× leverage. The Lindy version of feedback tools (Pastel, Marker.io, BugHerd) keeps a human in the loop. We removed that human.

## How it works

1. Embed the widget in any web product (single React component or script tag).
2. User activates feedback mode (keyboard shortcut or floating pill).
3. Click any element → a pin drops with their initial.
4. Type a comment. The widget captures element selector + screenshot.
5. Reviewer (or agent) sees the queue, approves what's actionable.
6. Approved feedback packages into copyable prompts for any AI agent (Claude Code / Codex / generic).
7. The agent ships the change. Receipts come back to the widget.

## The magic moment

> **First time the user drops a pin and 60 seconds later sees the actual fix in the product.**

Everything in onboarding optimizes for this moment. If we don't deliver it inside the first session, retention craters. This is our activation event.

## What makes it different

| Tool | Job | What's missing |
|---|---|---|
| Pastel / Marker.io / BugHerd | Send feedback to a human dev | Still requires a human in the loop |
| Loom / video feedback | Async demo of an issue | High effort + still requires implementer |
| GitHub Issues | Track bugs | Designed for engineers, not taste-makers |
| Notion / Linear comments | Discuss work | Not anchored to live product |
| **This product** | Visual feedback that an AI agent acts on directly | — |

The differentiator is the **handoff**. The widget isn't feedback — it's the bridge between human eye and agent hand.

## Brand voice & tone

**Confident, premium, calm.** Closer to Linear / Stripe / Arc than to Slack / HubSpot.

The user already feels competent. The tone should reflect that — speak to them as peers, not stakeholders.

- ✅ "Drop a comment. The agent ships."
- ✅ "Your taste, executed."
- ❌ "🚀 Supercharge your feedback workflow!"
- ❌ "Empower your team to..."

**Voice rules:**
- Active voice always
- Specific over general (one verb, not three)
- Never "AI-powered" — show, don't label
- Calm authority — we're the grown-up in the room

## What we are NOT

- ❌ A bug tracker
- ❌ A user research / survey tool
- ❌ A "voice of the customer" platform
- ❌ A community feedback board (no Canny / Productboard angle)
- ❌ A code review tool
- ❌ A no-code builder

Saying no to these keeps the surface narrow and the message sharp.

## North Star metric

**Fixes shipped per active user per week.**

Not pins dropped, not comments left, not seats sold — *fixes that actually merged into a product*. That's the value we deliver. Every product decision should ladder to this number.

Secondary metrics:
- Time from pin → merged fix (P50, P95)
- Activation: % of new users who reach a shipped fix in their first session
- Retention: % of users still active week 4

## Naming decision

**Brand: Serif.** Branding system:

- **Wordmark**: Serif
- **URL / handle**: theserif (`.com` preferred, `.io` as fallback)
- **Monogram**: TS (favicon, app icon, avatar)

Pattern: short wordmark + longer URL + 2-letter mark — same shape as Linear→linear.app, Notion→notion.so, Posthog→posthog.com.

Known collisions accepted in this decision:
- Serif (Europe) Ltd / Affinity suite (Canva-owned) — design-tooling space.
- TheSerif typeface by Lucas de Groot (LucasFonts, 1994) — typography reference designers will recognize.

Other names previously evaluated (parked, not eliminated):

| Name | Oblique meaning | Vibe |
|---|---|---|
| **Lume** | the light you cast on what to fix | Linear-tech premium |
| **Iris** | mythological messenger between humans and gods | refined classical |
| **Aria** | the solo voice that gets played | premium-warm operatic |
| **Ember** | small spark that ignites change | warm-organic |
| **Verve** | the energy/style applied to a product | confident-cool |
| **Redline** | editor's mark on what needs to change | editorial-direct |

All optimize for: 2 syllables, premium, English-first, real-or-coined, brandable, oblique (not literal).

## Marketing psychology applied

We're not naming this for SEO or Google Ads. We're naming and positioning for the **mental model the user already has**. These are the psychological principles guiding choices:

- **Jobs to Be Done**: We sell *fixes shipped*, not "a pin widget." Every page, ad, email frames in JTBD.
- **Loss aversion**: The painful state is the *current* one — taste lost in tickets, ideas evaporating. Don't lead with future gain; lead with present loss.
- **Activation energy** (BJ Fogg model): The first fix has to take < 60 seconds. Activation is the whole onboarding goal.
- **Endowment effect**: Generous free tier. Once the widget is in their flow, removing it is a loss.
- **Mere exposure + mimetic desire**: Seed the brand among visible taste-makers (well-known founders, designers). Their visible adoption signals quality.
- **Authority bias**: Position alongside Claude / Codex / OpenAI. Their authority transfers when we name them as upstream collaborators.
- **Reciprocity**: Free product wins (actual fixes, not just demos) before any upgrade ask.
- **Peak-end rule**: Engineer the *peak* (the magic moment of the first fix shipping) and the *end* (an emotionally satisfying "shipped" notification). The middle is utility; the peaks are brand.
- **Anti-status-quo bias**: People accept feedback evaporating because they're conditioned to. Our job is to make the *new* state feel safer than the old one — testimonials and case studies do the heavy lifting here.
- **Pratfall effect**: Be honest about limits ("AI agents draft fixes — you review before merging"). Admitting limits builds more trust than overpromising.
- **Default effect** (in product): Sensible defaults everywhere — agent target, prompt format, project ID. Defaults guide users toward best behavior without restricting them.
- **Curse of knowledge**: We can't assume users understand "agent" or "prompt." Explain in their language until proven otherwise.

## Anti-patterns to avoid

- **Don't sell "AI features"**. AI is the engine; *taste shipped* is the product. We don't say "AI-powered feedback" — we show the receipts.
- **Don't compete horizontally** with Notion / Linear / Asana on overlapping space. Stay vertical: feedback → action.
- **Don't gamify**. No badges, no streaks. The job is serious; the tone is calm-pro.
- **Don't add user research / surveys / polls in v1**. Narrow surface = sharp message.
- **Don't promise determinism**. AI agents miss sometimes. Frame outputs as "drafts to review," not magic.
- **Don't roadmap publicly too early**. Public roadmaps anchor the wrong expectations and slow shipping.

## Open questions

- [ ] Final brand name (5 finalists; need decision)
- [ ] Pricing model (per-seat vs. per-fix vs. hybrid)
- [ ] Free tier shape (limit by fixes, by projects, by users?)
- [ ] First channel for distribution (PH launch? founder networks? content?)
- [ ] How do we onboard the *reviewer* role separately from the commenter?

---

*Last updated: 2026-04-26*
