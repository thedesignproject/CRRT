# Resource quality checks

The resource library combines crawlable content with Lighthouse regression checks. These checks improve technical eligibility and usability; they do not guarantee indexing or citations by an AI service.

## Run locally

Install the locked dependencies with Bun 1.4.4 or a compatible version and use Node 22.19 or later (the repo's `.nvmrc` selects Node 22). Google Chrome must be installed. The audit launches a separate temporary headless Chrome profile; it does not use your signed-in browser profile.

```sh
bun run build:landing
bun run audit:resources
```

The default audits the resource hub and every guide and tool URL using the median of three simulated mobile runs. To run desktop checks or a smaller sample:

```sh
bun run audit:resources --profile=desktop --runs=3
bun run audit:resources --runs=1 --paths=/resources,/resources/design-tokens-for-ai-prototypes
```

The runner starts and stops its own production preview on port 4323. Override with `--port=4324` if needed. It writes HTML reports, raw JSON reports, and `summary.json` beneath `artifacts/lighthouse/mobile/` or `artifacts/lighthouse/desktop/`. Those files are ignored by Git. It never uploads to public Lighthouse storage.

## Regression budgets

| Check | Required result |
| --- | --- |
| Performance | At least 95/100 |
| Accessibility | 100/100 automated score |
| Best practices | 100/100 automated score |
| SEO | 100/100 automated score |
| Largest Contentful Paint | At most 2,500 ms |
| Total Blocking Time | At most 200 ms |
| Cumulative Layout Shift | At most 0.1 |
| Downloaded scripts | At most 450,000 bytes |
| Downloaded stylesheets | At most 145,000 bytes |
| Agentic browsing | Applicable binary checks pass; errors or missing checks fail |

Asset budgets use the uncompressed local preview. Production CDN compression can reduce transfer sizes further, but cannot hide asset growth from these checks. Missing metrics, category scores, or resource-size measurements fail the gate instead of being treated as zero. Three-run checks use medians to reduce timing noise.

The experimental agentic-browsing category is a pass fraction, not a search ranking or a general AI quality score. The runner preserves each underlying audit's status in the summary. WebMCP and ARD checks can be marked not applicable when the site does not advertise those integrations. A passing category does not mean those integrations exist. CLS is gated independently as a performance metric.

Lighthouse accessibility tests cover automated checks only. Continue reviewing keyboard interaction, content clarity, responsive behavior, and actual user tasks manually.

## Continuous integration

[The resource quality workflow](../.github/workflows/resources-quality.yml) runs on relevant pull requests, changes to trunk, and manual dispatch. Mobile and desktop jobs each audit every resource URL three times. Failures block the job. Reports are saved as GitHub workflow artifacts for 14 days, including on failure. The workflow is configured in this branch; it will run in GitHub when the branch is pushed through the normal review flow.

The workflow also runs `scripts/public-pages.test.ts`, which verifies substantive HTML and Markdown without JavaScript, unique document metadata, canonical links, sitemap coverage, structured data, route CSS in the initial HTML, local fonts, machine-readable links, routing boundaries, and real 404 handling through the public server tests in the main suite.

## Performance decisions

- Resource URLs load their own surface rather than the dashboard/widget/application code. Prerendered content remains visible while the route module loads.
- The generated client catalog contains metadata only. Each article hydrates from its own non-executable JSON data in the HTML, so expanding the library does not ship every article body to each visitor.
- Resource pages hydrate their existing DOM instead of replacing the article after JavaScript arrives. Theme initialization matches the server markup, then restores the saved preference without overwriting it.
- Split route styles and module preload links are emitted into the initial HTML. The page retains its layout when JavaScript is unavailable.
- The existing Geist Mono brand font is self-hosted with `font-display: swap`. The landing no longer depends on Google Fonts requests. Figtree and VT323 remain self-hosted as before, and the original font licenses are retained.
- Content-hashed assets use `public, max-age=31536000, immutable` in the generated deployment routes and local preview. Negotiated HTML/Markdown retains its existing private cache policy and `Vary: Accept` protections.
- Decorative Hairline figures load separately, reserve space, and use reduced-motion handling.
- Shared shell styles load with the entry; marketing layout and animation styles load only on application and marketing routes. Resources retain the same fonts, theme, navigation, footer, and component styles.

## AI and search discoverability

The implementation retains direct answers, specific task examples, transparent authorship and dates, primary-source references, descriptive internal links, and appropriate CollectionPage, Article, and BreadcrumbList schema. Article claims and metadata match visible text. It does not fabricate credentials, endorsements, or customer outcomes.

The existing robots policy allows public crawling while excluding dashboard, API, audit, and private share paths. This work preserves that policy. The resource URLs are in the sitemap and the existing `llms.txt`; each has a plain Markdown copy and supports `Accept: text/markdown`. Machine-readable copies are conveniences, not a substitute for useful public HTML.

## Limits and post-deployment checks

Local Lighthouse results are lab measurements of this production build. They do not measure the deployed CDN, geographic latency, production crawler access, actual index coverage, AI citations, or real-user INP. Those measurements are N/A until the relevant production or analytics evidence is available.

After deployment, run Lighthouse against the live resource URLs, check indexability and canonical selection in Search Console, verify the CDN serves public resources to intended crawlers, and monitor real-user LCP, CLS, and INP. Refresh tool references when Lovable, v0, or the coding-agent workflow changes.

## Add or edit a resource

Edit `apps/landing/resources/content.ts` or `additionalContent.ts`. Run `node scripts/generate-resource-catalog.ts` to refresh the metadata-only catalog and the practical-resource section of `llms.txt`; builds and the landing dev command also do this automatically. Commit the generated catalog with the authored content. A consistency test catches stale generated metadata.

Each resource needs a unique slug and search title, substantive task-specific content, primary-source references, and valid related-resource links. Interactive tools retain an instructional article and worked example without JavaScript. Inputs and results stay in the browser; they are not submitted as feedback automatically.

## References

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Chrome: Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview/)
- [Chrome: experimental agentic-browsing scoring](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring)
- [Google: robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
