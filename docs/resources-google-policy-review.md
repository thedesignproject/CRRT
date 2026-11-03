# Google policy review — November 3, 2026

**Verdict: editorial work remains before treating the full library as ready for search publication.** No zero-penalty guarantee is possible. The code review did not identify an obvious cloaking, keyword-stuffing, fake-rating, or scraped-content scheme. This is not a finding that all 157 URLs meet Google's quality expectations, nor a check of the domain's actual enforcement status.

Scope: the current resources branch, 120 guides, 36 working utility pages, the index, and their delivery/metadata implementation. Evidence consists of repository content, the existing automated checks, a local phrase-overlap diagnostic, and Google's official documentation read on November 3. No connected Search Console or SEO-platform data was available. The web reader could not fetch the live hub, but a direct HTTPS fallback returned 200 and exposed the original 21 individual resource links. The new `/resources/screenshot-annotator` URL returned a genuine 404. These checks distinguish the current deployment from the larger proposed expansion; they do not verify Googlebot access, every deployed URL, or existing penalties.

## Health and next action

No numerical Google quality or penalty score is assigned; Google does not expose such a score. The status below describes this review's evidence, not a Google rating.

| Item | Health | Evidence | Next action |
| --- | --- | --- | --- |
| AI-assisted creation | Permitted conditionally | Google allows assistance, but requires accuracy, usefulness, and fact-checking before publication. | Human editorial review of each publishable asset. |
| 120-guide expansion | Needs editorial review | Distinct prose and tasks; no exact duplicate guide paragraphs in the local scan. Several topics overlap in intent and most lack demonstrated first-hand product evidence. | Check task boundaries; combine overlapping pages when they cannot independently satisfy a distinct need. Add relevant real screenshots or tested examples where they improve the answer. |
| 33 added utility descriptions | Improved | Before this pass, generic preparation, verification, and FAQ copy repeated across tools. The working controls provide distinct value. | Keep task-specific instructions, examples, limitations, and the actual tool as the main content; review outputs. |
| Reference-verification statement | Fixed | Every article previously claimed references had been checked on the same date, without an individual check record for the complete expansion. | Removed the blanket statement. Do not claim a person reviewed or tested a page without a recorded review. |
| Author and dates | Needs editorial confirmation | CRRT is the organization author; publication/modification dates are fixed at November 2 rather than regenerated on every build. | Confirm accurate initial publication and meaningful modification dates before release. Add a real reviewer only after that person reviews the content. |
| Technical delivery | Positive implementation evidence | Meaningful prerendered HTML, canonical URLs, internal links, sitemap, real 404s; Markdown is selected by `Accept`, not crawler identity. | Verify deployed responses and canonical/indexing decisions through Search Console after release. |
| Structured data | No obvious misleading claims found in reviewed code | Article, BreadcrumbList, CollectionPage, and utility WebApplication markup reflects visible content. No fabricated stars or reviews. | Validate deployed representative pages; never add claims solely to obtain rich results. |
| Google AI visibility | No special optimization required | Google's guidance says normal SEO and people-first value apply. Google Search ignores `llms.txt`; it is not a ranking benefit or penalty shield. | Keep alternate formats for services that use them, without making Google ranking promises. |
| Manual actions / indexing / security issues | Unverified | Search Console is not connected; no report/export supplied. | The property owner must inspect Manual actions, Security issues, Page indexing, and representative URL Inspection results. |

## What changed in this pass

- Removed the universal dated reference-verification claim from article footers while retaining AI-assistance disclosure and further-reading links.
- Replaced repeated boilerplate on 33 added utility pages with the existing tool-specific input, output, example, and limitation text. Their FAQ answers now refer to the actual tool inputs and limits.
- Preserved all 157 resource URLs and the working tools. No blanket `noindex`, redirects, page removals, or canonical consolidation were applied without an editorial decision.
- Created [the editorial review inventory](resources-editorial-review.csv) for all 156 individual assets. Every human-review and publish-decision field starts unverified; automated checks do not fill those fields.

## Priority editorial decisions

1. Review the distinction between `/resources/review-light-and-dark-themes` and `/resources/how-to-review-light-and-dark-component-themes-together`. A whole-product color review and a component-state review can both be useful, but each needs a clearly distinct outcome and example.
2. Review the cluster covering component documentation, behavior contracts, assembling agent context, and what an agent should know before a component change. Keep separate URLs only when each solves a different reader task; otherwise consolidate and plan appropriate redirects.
3. Check each comparison against current primary sources and actual tested evidence. Illustrations and hypothetical workflows must remain explicitly illustrative; do not turn them into customer results or hands-on claims.
4. Review every page's title, answer, actual tool behavior, limitations, source relevance, and factual claims. A link under “further reading” does not automatically substantiate every statement on a page.
5. For any asset that does not yet provide sufficient distinct value, choose whether to improve, consolidate, or hold it from Search. Creating pages in smaller batches alone does not resolve low-value content.

## Word counts and duplication

The 120 guides had a median of roughly 205 prose words before this pass, excluding code/examples, headings, and list items. This is descriptive, not a failed minimum: Google expressly says it has no preferred word count. Do not pad articles to meet an arbitrary target. A concise complete answer can be useful; a longer repetitive answer can still be poor.

The phrase diagnostic found substantial shared wording in the previous utility instructions. The scan is a local editing aid, not Google's duplicate-content classifier or a penalty threshold. Distinct wording alone is also insufficient: pages must add distinct user value. Shared navigation, disclosures, and component layout are not by themselves evidence of spam.

A page not being indexed or ranking poorly does not by itself establish a spam-policy violation or a manual penalty.

## Publication checklist

For each asset in the inventory, record a real reviewer and decision after checking:

- It satisfies a distinct audience task without requiring the reader to find the missing answer elsewhere.
- Claims are accurate, sources are relevant, examples are reproducible where applicable, and hypothetical evidence is clearly labeled.
- Tool inputs, results, exports, limitations, and privacy descriptions match actual behavior.
- The title, metadata, structured data, author, and dates accurately represent the visible content.
- Overlap with existing pages has a deliberate keep/consolidate/hold decision.

An approved entry records a reviewer, date, and evidence; it does not guarantee ranking. Unapproved entries should not be represented as having passed a human editorial review. Choose publication/indexing behavior for those entries before merging or releasing the entire library.

## Official sources

- [Google: using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) — manual fact-checking, metadata accuracy, and value.
- [Google: spam policies](https://developers.google.com/search/docs/essentials/spam-policies) — scaled content abuse, doorways, cloaking, misleading functionality, link spam.
- [Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — purpose, experience, accuracy, meaningful dates, and no preferred word count.
- [Google: optimizing for generative AI search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) — non-commodity value, query variations, duplicate reduction, and unsupported GEO tactics.
- [Google: structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) — visible, accurate, non-misleading markup; automated validation cannot establish every quality requirement.

## Validation of this pass

The updated content passed the full 3,980-test suite (215 existing skips), including prerendered output checks for all 162 public pages. Type checks passed; diff line and branch coverage are both 100% against `origin/trunk`. A local Vitest config-bundling hang required a temporary native-loaded copy of the same settings, replacing `__dirname` with its equivalent `import.meta.dirname`; the temporary file was removed. CI reruns the repository's normal configuration. These checks validate implementation, not Google's editorial acceptance.
