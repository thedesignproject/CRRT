# CRRT resources: audience, content, and search brief

Research date: November 2, 2026. Initial implementation: six practical guides at `/resources`.

## Evidence and audience

The [live CRRT site](https://crrt.ai/) positions the product around people giving visual feedback and coding agents implementing fixes. The repository's `docs/context.md` identifies designers, founders, PMs, developers, and independent builders as users, unified by noticing product issues and wanting them resolved. Its naming and pricing sections are historical; the current site and `rules/business.md` take precedence for public positioning.

The initial audience recommendation is an inference from those sources: prioritize designers and founders already building or refining web products with AI tools. They have a running interface to review, can recognize visual drift, and need a reliable way to turn a concrete observation into a reviewed implementation. Product managers and design-system maintainers are adjacent audiences for the workflow and component guides.

This research uses public documentation and the repository. It does not include customer interviews, authenticated product analytics, paid keyword data, measured search volume, or keyword difficulty estimates. Validate acquisition priorities with Search Console and activation data after publication.

## Initial content choices

| Search intent | Reader's task | Initial guide | Connection to CRRT |
| --- | --- | --- | --- |
| Design tokens for AI prototypes | Stop screens drifting as a prototype expands | Start with one approved screen and a semantic token file | Capture a specific inconsistency and request reuse of the approved rule |
| Document components for coding agents | Help a builder reuse existing components | A component brief with states and runnable examples | Attach feedback to an actual instance and verify the shared implementation |
| Visual feedback for coding agents | Explain a UI correction clearly | Target, observation, outcome, boundaries, and verification template | Directly supports the accepted-feedback handoff |
| UI review checklist for AI-generated apps | Decide whether a flow is ready to ship | Journey, responsive layout, states, accessibility, and fix verification | Review and prioritize issues before handing accepted work to an agent |
| Prototype with Lovable | Test one useful interaction | Small brief, incremental build, focused corrections, and explicit simulated behavior | Continue visual review on a supported project surface; no assumed native editor integration |
| Prototype in v0 with a design system | Preserve an existing product's patterns | Supply real components, tokens, and setup context; inspect code reuse | Connect accepted corrections to the repository's coding-agent workflow |

Launch with useful task-level guides instead of a large glossary or generic AI news library. Each article includes a direct answer, original sample task or template, review criteria, common questions, primary-source references, and related guides. Templates are recommendations, not claims of measured performance or customer results.

## Tool and content research

- [Lovable prompting guidance](https://docs.lovable.dev/prompting/prompting-one) supports focused briefs and iterative construction. Its [current preview-toolbar documentation](https://docs.lovable.dev/features/preview-toolbar) supersedes the older Visual edits terminology. The guide uses current language and avoids brittle button-by-button instructions.
- [v0 design systems](https://v0.app/docs/design-systems-2) and [design mode](https://v0.app/docs/design-mode) support system-aware creation and preview refinement. Product availability and permissions can differ, so the article points to current instructions instead of inventing universal access.
- [Storybook stories](https://storybook.js.org/docs/writing-stories) and [AI guidance](https://storybook.js.org/docs/ai/best-practices) ground the component examples. The article does not require experimental manifest features.
- [Design Tokens Community Group](https://www.designtokens.org/) grounds terminology; the starter example uses ordinary CSS custom properties and does not claim DTCG JSON conformance.
- [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) supports the stated contrast thresholds. The UI checklist explicitly distinguishes a short review from accessibility conformance.

## Search and answer-engine implementation

Follow [Google's AI features guidance](https://developers.google.com/search/docs/appearance/ai-features) and [Article structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/article). These support existing SEO fundamentals; they do not promise inclusion or rankings.

- Render the complete hub and all six articles to HTML at build time. Keep the substantive text available without JavaScript.
- Give every page a unique title and description, canonical URL, social metadata, and sitemap entry. Article titles use a concise search title while keeping a fuller visible heading.
- Use accurate CollectionPage/ItemList, Article, and BreadcrumbList JSON-LD. Keep author, dates, titles, and source claims consistent with visible content. Do not add fabricated credentials, reviews, statistics, or FAQ rich-result promises.
- Link the library from the marketing navigation and footer. Link each guide to two relevant next steps and the installation documentation.
- Preserve Markdown copies and content negotiation through the site's existing public renderer. Update the existing `llms.txt` as a convenience; do not treat it as an indexing requirement or ranking signal.
- Use descriptive headings, concise answers, named concepts, source references, and copyable examples. Disclose AI assistance and the date of documentation checks.
- Keep unknown resource URLs on the existing server-side 404 path. Preserve dashboard, API, audit, and shared-link routing boundaries.

## Brand and implementation

Use the existing marketing theme, Figtree body/display typography, Geist Mono utility labels, canonical carrot, orange actions, borders, and theme controls. The resource grouping takes inspiration from the supplied directory references without copying their content or visual identity. Use [Hairline](https://github.com/lucasmarkes/hairline) for restrained decorative figures, with no idle animation, reserved layout space, reduced-motion support, and theme colors mapped to existing CRRT tokens.

## After publication

Check indexability and canonical selection in Search Console. Compare impressions and visits by guide, then connect resource visits to installation and the first reviewed fix where analytics supports that attribution. Refresh tool instructions when the underlying product changes. Expand the cluster that brings relevant readers into a real feedback-to-fix workflow.
