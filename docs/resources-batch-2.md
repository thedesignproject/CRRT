# Resource expansion from crrt-content.md

Source brief: the user-provided `crrt-content.md`. Batch: 12 new guides and 3 interactive tools, bringing the library to 18 guides and 3 tools.

## Audience evidence

The referenced GitHub issues were checked through the connected GitHub source. [Issue 201](https://github.com/thedesignproject/CRRT/issues/201) describes reviewing a design-system prototype with light and dark themes. [Issue 200](https://github.com/thedesignproject/CRRT/issues/200) mentions screenshots from stakeholders. These are past reports, not an active-user breakdown, verified job titles, testimonials, or evidence of measured business outcomes. No customer identities or screenshot assets were reused in the public guides.

The topics below address the brief's potential audiences through concrete review tasks. Those audience choices remain qualitative targeting hypotheses. No search-volume, difficulty, or conversion estimates were invented.

## Content map

| Brief ID | Resource | Distinct job |
| --- | --- | --- |
| 8 | Report responsive UI issues precisely | Preserve viewport, content, state, and reproduction evidence |
| 11 | Run a focused 15-minute prototype review | Organize one task and end with owned decisions |
| 22 | Compare a design frame with a browser screenshot | Match capture conditions before interpreting visual differences |
| 33 | Review light and dark themes together | Compare semantic roles and states across a paired review |
| 41 | Minimum viable design system | Bound the first system around one real flow and prove reuse |
| 60 | Record design decisions for coding agents | Preserve the reason and scope behind an approved rule |
| 63 | Scope one visual fix for a coding agent | Establish accepted implementation boundaries and review evidence |
| 75 | Find missing states in generated forms | Test validation, pending, failure, recovery, and success |
| 81 | Organize a Storybook design review | Review stories and connect shared changes to product consumers |
| 91 | Verify a UI fix before resolving feedback | Tie resolution to the original state and actual checks |
| 101 | Onboard a client to a prototype review | Explain the task, maturity, boundaries, feedback format, and owner |
| 120 | Visual feedback vs visual regression testing | Distinguish design judgment from baseline comparisons |
| 32, 33 | Text contrast checker | Calculate an opaque sRGB pair against the selected AA text criterion |
| 36 | px/rem converter | Convert against an explicit root-size assumption |
| 1, 2, 61 | Visual feedback brief builder | Assemble and copy a draft without submitting feedback |

## Editorial and technical boundaries

The review agendas, matrices, and templates are suggested methods and fictional worked examples. They are not universal standards, customer case studies, native editor integrations, or measured performance claims. Humans retain the approval and merge decisions.

Text contrast uses the W3C relative-luminance calculation and unrounded comparisons. It accepts opaque three- and six-digit HEX only. It does not evaluate transparency, gradients, images, non-text requirements, or overall accessibility conformance. The converter performs arithmetic and does not change project CSS. The brief builder does not create projects, submit comments, grant access, or connect an agent.

The new content reuses the existing resource layout, source citations, Article and Breadcrumb metadata, canonical URLs, sitemap, HTML/Markdown renderer, and Lighthouse budgets. Tool pages also describe their WebApplication entity. The client catalog is generated from authored metadata; complete article bodies stay out of browser JavaScript bundles and are embedded only in the corresponding article's HTML.

## Primary references

- [W3C: minimum text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: relative luminance](https://www.w3.org/WAI/WCAG22/Understanding/relative-luminance.html)
- [W3C: text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [W3C: responsive reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [W3C: form validation](https://www.w3.org/WAI/tutorials/forms/validation/)
- [Storybook: writing stories](https://storybook.js.org/docs/writing-stories)
- [Playwright: visual comparisons](https://playwright.dev/docs/test-snapshots)
- [MDN: CSS values and units](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Values_and_units)

## Validation

- Production build generates 27 public HTML/Markdown page pairs, including all 22 resource URLs.
- Full suite: 3,216 tests passed; 215 existing skipped tests. Type checking passed.
- Changed-line and changed-branch coverage: 100%.
- Every resource URL passed mobile and desktop Lighthouse budgets; see [the measured audit](resources-quality-audit.md).
- Browser checks verified all three tools, copying, and responsive layout.

Changes remain local on `feat/resources-hub`; nothing was deployed or published.
