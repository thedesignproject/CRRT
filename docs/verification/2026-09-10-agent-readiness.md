# Agent readiness verification — 2026-09-10

Branch: `feat/agent-readiness`, isolated worktree `crrt-agent-readiness`.
Base: `origin/trunk` at `e6437fa`. The original `crrt` worktree and its local edits were not changed. No database migrations, production deployment, merge, or package publication were performed.

## Changes

- Build-time rendering of the existing marketing components and all four documentation URLs. The interactive app still uses its existing client mount; shared links and audit workspaces retain their original empty app shell.
- HTML and Markdown from the same render; canonical/social metadata, SoftwareApplication JSON-LD, sitemap, robots.txt and llms.txt. Design tokens are available before JavaScript. Scroll-reveal content is readable without JavaScript.
- A separate public-page function handles Accept negotiation, q-values, exclusions, GET/HEAD, 405 and 406. Negotiated responses use Vary: Accept, Accept-Encoding and disable shared caching. Existing API/workflow, dashboard, audit and shared-link routes remain separate. Missing pages, including unknown documentation URLs, return real 404 responses with recovery links.
- OpenAPI 3.1 contract for the existing authenticated agent share API: presence, state, events and operations. Developer links and HTTP examples are available in the existing agent handoff guide. The homepage Docs link now opens /docs.
- Optional trailing slashes render the same guide after JavaScript starts. Client navigation updates page titles, canonical URLs, social metadata and Markdown links.

## Results

- `bun run typecheck`: passed.
- Full Vitest coverage suite: **1,340 passed, 13 skipped** (141 passing files, 3 skipped integration files). The skipped integrations need external credentials/configuration.
- Differential line coverage: **100%**, 42 executable changed lines. Compared against `origin/trunk`, the current trunk used as the branch base; local `trunk` is an older checkout.
- Differential branch coverage: **100%**. Ran the repository checker, then expanded its path selection to include landing and server files (the existing script omits them).
- Landing, dashboard and complete Vercel Build Output API packaging: passed. Packaging ran directly, without the deploy-build command's database migration step.
- `node scripts/verify-public-site.ts http://127.0.0.1:43871`: **37 HTTP checks passed**, covering all public HTML/Markdown pages, HEAD, 406, q-values, machine-readable files and real HTML/Markdown 404s.
- Actual bundled `public-site.func/index.mjs`: **6 HTTP checks passed** for homepage, docs and missing pages in both negotiated formats, including Vercel's rewrite parameter.
- OpenAPI validated with Swagger Parser. Every documented path and method maps to an existing handler using requireAgentShare.
- Existing production agent state/events/presence/ops endpoints: **401 Missing share token** without credentials. These requests did not create or change feedback.
- Chrome headless comparison against a temporary build of the exact base commit: **0 different pixels** at 1440px and 390px. Animations and external fonts were normalized identically for comparison. No page JavaScript errors. Existing mobile off-canvas overflow is identical to the base, not introduced here.
- Browser navigation: homepage Docs link, trailing-slash agent guide, desktop/mobile docs navigation and client canonical metadata all passed.
- JavaScript disabled: homepage **2,624 visible text characters**; docs/install **3,233**; agent guide **5,208**; self-host guide **3,912**. H1 headings and reveal sections were visible.

## Reproduce

Use Node 22.18+ (the repository's Node 22 line) or Node 24+, and the repository-pinned Bun version for installation/packaging.

```sh
bun run build:landing
bun run build:dashboard
PORT=43871 node scripts/preview-public-site.ts
# In another terminal:
node scripts/verify-public-site.ts http://127.0.0.1:43871
```

The local preview serves built pages and app shells. It does not emulate the authenticated API. After an authorized Vercel preview deployment, run the HTTP verifier against that URL as well.

## Remaining checks and product decisions

Vercel preview deployment was attempted with `vercel deploy --prebuilt --yes --scope designproject`, but the service rejected it: **“You don't have permission to create the resource.”** No preview URL was created. Preview environment variable retrieval also returned **“Project Environment Variable not found.”** Someone with deployment access must configure a preview and verify platform routing/CDN behavior there before production. Authenticated dashboard, feedback and audit flows need preview credentials and were not verified end-to-end in Vercel.

No new Is Agentic production score is claimed: crrt.ai has not been updated. Rescan after an approved deployment.

Publishing an official CLI, anonymous product-data access, third-party brand listings/press and Search Console changes require separate product decisions or credentials. OpenAPI describes real authenticated endpoints; no authentication was removed to improve an automated score. Legal/contact pages should use approved company information rather than invented copy.
