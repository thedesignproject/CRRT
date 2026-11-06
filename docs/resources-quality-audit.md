# Resource quality audit — November 2, 2026

Source: **Measured**, local production build, Lighthouse 13.6.0. All **22 resource URLs** were tested: the hub, 18 guides, and 3 interactive tools. The final validation uses one mobile and one desktop run per URL (44 audits). This is a pre-deployment lab audit, not production field data. CI remains configured for three runs per URL and profile.

## Results

| Resource | Mobile performance | Desktop performance | Accessibility | Best practices | SEO | Health |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `/resources` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/design-tokens-for-ai-prototypes` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/document-components-for-coding-agents` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/visual-feedback-for-coding-agents` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/ui-review-checklist-ai-generated-apps` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/lovable-prototype-review-workflow` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/v0-prototyping-with-your-design-system` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/report-responsive-ui-issues` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/focused-prototype-review` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/compare-design-to-browser` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/review-light-and-dark-themes` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/minimum-viable-design-system` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/design-decisions-for-coding-agents` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/scope-a-visual-fix` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/review-ai-generated-forms` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/storybook-design-review` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/verify-a-ui-fix` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/client-prototype-review` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/visual-feedback-vs-visual-regression` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/text-contrast-checker` | 96 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/px-to-rem-converter` | 100 | 100 | 100 | 100 | 100 | Healthy |
| `/resources/visual-feedback-brief-builder` | 96 | 100 | 100 | 100 | 100 | Healthy |

Mobile LCP: **1202–2284 ms**. Mobile TBT: **0–0 ms**. Maximum mobile CLS: **0.026596**. Every score, metric, script-size, and stylesheet-size budget passed.

The resource hub downloads 395,646 bytes of scripts in the uncompressed preview, compared with 717,229 bytes in the initial baseline: approximately **44.8% less JavaScript**. Complete article bodies stay out of client bundles. Resource pages make no third-party font requests.

## AI and search checks

| Item | Evidence / score | Health | Next action |
| --- | --- | --- | --- |
| Crawlable content | All 22 resource pages have substantive prerendered HTML, route CSS, Markdown copies, and discoverable links; covered by build tests | Healthy | Retest when adding guides |
| Metadata and schema | Lighthouse SEO 100/100 on every URL; build tests validate canonical links, document identity, Article/Breadcrumb data, sitemap entries, and visible content | Healthy | Validate the live deployment after publishing |
| Agentic browsing | Applicable binary checks pass on all runs; CLS passes its independent budget | Healthy | Monitor the experimental audit as standards change |
| Optional agent protocols | WebMCP and ARD audits report not applicable; these integrations are not advertised by the resource library | N/A | Add only for a concrete product need |
| Crawler policy | Existing robots policy allows public content and excludes dashboard, API, audit, and private-share paths | Healthy locally | Verify production CDN access after deployment |
| Search index coverage and AI citations | No connected Search Console / citation analytics evidence for these unpublished URLs | N/A | Measure after publication |
| Real-user Core Web Vitals | Local Lighthouse lab measurements only; field INP and CrUX data are unavailable | N/A | Monitor LCP, CLS, and INP in production |

## Changes made

- Added pinned Lighthouse tooling, local commands, score/metric/asset budgets, and a mobile/desktop GitHub Actions workflow with retained reports.
- Split the resource entry from application, dashboard, and widget code, and generate a metadata-only client catalog.
- Hydrate resource HTML in place to preserve the visible document during JavaScript startup.
- Split shared shell CSS from marketing layouts and animations; this removed unused styles from resource routes after mobile first-paint regressions were detected.
- Verify all three tools in the browser, including contrast threshold behavior, unit conversion, edited drafts, and copy confirmations, with responsive checks at 390px.
- Restore saved theme preferences after the first hydration render without overwriting them.
- Include split route CSS in the initial HTML and preload its modules.
- Self-host the existing Geist Mono brand font and remove blocking Google Fonts requests from the landing.
- Cache content-hashed assets immutably while preserving private caching for negotiated HTML/Markdown.

## Remaining nonblocking diagnostics

Lighthouse still identifies opportunities to reduce unused shared CSS/JavaScript and serve the canonical carrot at smaller image dimensions. They do not fail the performance budgets. Missing production field data, live CDN behavior, actual index coverage, and AI citations cannot be verified from a local build. No publication or ranking claim is made.

## Reproduce and inspect

See [resource quality commands and budgets](resources-quality.md). Raw HTML/JSON reports and per-profile summaries are generated under `artifacts/lighthouse/`. CI is configured to use three runs for both profiles; this final local validation used one run per URL and profile.

References: [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features), [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview/), [experimental agentic audit scoring](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring).
