# Full-brief resource quality validation

## Verified scope

- 157 resource URLs: 120 guides, 36 utility pages, and the resource hub.
- 162 total public HTML/Markdown pairs, retaining the five existing public pages.
- All 120 topic IDs and all 36 utility IDs appear exactly once in the coverage test.
- Full suite: 3,980 tests passed, with 215 existing skipped tests. Type checking passed.
- Changed-line and changed-branch coverage: 100% against current `origin/trunk`.

## Measured mobile preflight

Source: local production build with Google Analytics enabled, Lighthouse 13.6.0. One run per listed URL. These November 2 preflight measurements cover representative new surfaces, not all 157 pages. Broader validation is recorded below when completed.

| Page | Performance | Accessibility | Best practices | SEO | Health | Next action |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `/resources` | 98 | 100 | 100 | 100 | Passed | Exhaustive sharded CI audit |
| `/resources/hex-rgb-converter` | 100 | 100 | 100 | 100 | Passed | Exhaustive sharded CI audit |
| `/resources/screenshot-annotator` | 96 | 100 | 100 | 100 | Passed | Exhaustive sharded CI audit |

All score, metric, agent-accessibility, and asset-size budgets passed on these preflight URLs. The 450 KB JavaScript budget includes the existing Analytics script.

## Automated and browser checks

Build tests inspect every page for meaningful HTML/Markdown, unique document metadata, canonical URLs, sitemap coverage, structured data, route styles, and real public routing. Each article embeds only its own tool configuration and navigation/related metadata; the hub embeds the full browsing catalog.

Utility tests cover channel conversion, color candidates, spacing overrides, token diffs, missing/ordered timestamps, escaped exports, worksheet edits, status and row operations, and local-file validation. Browser checks confirmed the 12-topic/type filters and live conversion/copy behavior. The native browser connection closed during the local-image chooser check; that attempted manual upload is not counted as a completed browser verification. Image loading and export behavior are covered by the automated tests.

## Exhaustive Lighthouse CI

The workflow splits all 157 URLs into eight non-overlapping shards per profile. Each URL is audited three times for mobile and three times for desktop, for 942 audits in a complete workflow run. Reports are retained as workflow artifacts. No page is omitted by sharding.

## Production evidence

Index coverage, real-user Web Vitals, deployed crawler access, and AI citations are unmeasured for the new pages. Useful HTML, accurate metadata, sources, and passing lab checks do not guarantee rankings or AI citations.

## November 3 follow-up

The first complete CI matrix passed all desktop shards and six of eight mobile shards. It identified three mobile loading regressions: the accepted-feedback brief guide, the Lovable guide, and the Slack-review comparison. Accessibility, best practices, SEO, asset-size, and applicable agent checks passed; the failures were performance/LCP.

The resource bootstrap now allows the complete prerendered document to paint before requesting the interactive renderer. Route CSS remains in initial HTML. Analytics and all score/metric budgets remain intact. The bootstrap is approximately 2.4 KB; the renderer still loads and its bytes remain included in Lighthouse measurements.

After that change, three-run mobile retests passed on all five selected pages (the hub, the three CI failures, and the screenshot annotator), with 100 for performance, accessibility, best practices, and SEO throughout. The earlier broader local sample passed on all 49 mobile URLs and all 11 desktop URLs. Those samples cover every utility, one guide from each source category, and representative desktop layouts. The exhaustive matrix is rerun for the updated PR commit.

The general CI suite passed React 18 and React 19 tests, type checks, diff coverage, builds, bundle limits, dependency audit, and schema checks. Its separate secret scanner flagged a historical mocked request UUID outside this change. No scanner exception has been applied; an explicit approval decision is pending because automatic approval review rejected changing the persistent ignore list.

## AI for UI review

The project-local AI for UI skills were applied to resource controls, keyboard focus, touch behavior, and rendering work. See [the UI review](resources-ui-review.md) for findings and verification. Three-run mobile checks on the updated hub, converter, and component-state matrix passed at 97/100/100/100, 100/100/100/100, and 100/100/100/100 respectively. The next exhaustive matrix remains a distinct CI check.

The preceding complete matrix at `70dc8c8` passed 15 of 16 Lighthouse shards; its remaining hub failure was 94 performance and 228ms total blocking time. The new off-screen row layout optimization keeps every resource link in the HTML. No budget was relaxed.
