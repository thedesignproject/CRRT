# Full-brief resource quality validation

## Verified scope

- 157 resource URLs: 120 guides, 36 utility pages, and the resource hub.
- 162 total public HTML/Markdown pairs, retaining the five existing public pages.
- All 120 topic IDs and all 36 utility IDs appear exactly once in the coverage test.
- Full suite: 3,978 tests passed, with 215 existing skipped tests. Type checking passed.
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
