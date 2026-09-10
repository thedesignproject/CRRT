# CRRT agent readiness

Approved in conversation on 2026-09-10, with an isolated branch and no production changes.

Base: origin/trunk e6437fa. Branch: feat/agent-readiness. The original checkout contains unrelated work and stays untouched.

## Design

Prerender the existing marketing composition and documentation at build time. Reuse components; retain the existing client mount, widget, audit flow, animations, styles, and app routing. Include design tokens in HTML so no-JavaScript visitors see the same styling. Make scroll-reveal content visible without JavaScript.

Generate HTML and Markdown from the same render, plus canonical metadata, SoftwareApplication JSON-LD, robots.txt, llms.txt, and a sitemap containing only public editorial pages. Derive sitemap modification dates from Git source history rather than inventing freshness.

Use a separate, small public-page function for RFC 9110 Accept negotiation and helpful 404 responses. It has no database or authentication dependencies. Route only known public pages to it before filesystem lookup; retain existing API/workflow, dashboard, audit and shared-link routing, then return an actual 404 for unresolved URLs. Disable shared caching of negotiated responses to prevent cross-format cache poisoning. Serve static assets normally.

Publish an OpenAPI 3.1 contract for the existing agent share API (presence, state, events, operations). Preserve authentication. Do not create an anonymous data API or publish a CLI merely for a score.

## Validation and rollout

Test negotiation (wildcards, q-values, exclusions, 406, GET/HEAD/405), routing precedence, built HTML/Markdown parity, headings, metadata, sitemap, llms links and OpenAPI validity. Run typecheck, builds, the existing tests and diff coverage; inspect browser behavior with and without JavaScript. Verify a preview deployment if credentials permit, without running migrations. Do not deploy production or merge.

Remaining product decisions: CLI publishing/distribution; public third-party listings/press and Search Console; anonymous application API access; legal/company contact copy.
