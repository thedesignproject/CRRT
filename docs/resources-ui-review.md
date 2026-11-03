# Resource UI review — November 3, 2026

Verdict: **Ship it for the reviewed UI scope.** The findings below are fixed. Exhaustive CI results remain a separate release check.

## Scope and method

Installed `@aiforui/install@0.1.5` in project scope and applied its UI Review, Touch & Accessibility, Forms & Inputs, and Performance guidance. The installer downloaded 28 skills for the detected Claude Code, Cursor, and Codex installations. These developer-local skill files are excluded locally from Git; no account token or downloaded skill content is included in this PR.

Reviewed the resource index, article navigation, converter, worksheet, and shared resource menu against CRRT's existing components and tokens. Browser checks used Chrome at the normal desktop viewport and at 320px and 390px widths. These are responsive browser checks, not physical iPhone testing.

## Findings fixed

| Priority | Finding | Result |
| --- | --- | --- |
| Accessibility | Filter buttons, search clearing, copy actions, theme switching, and some navigation targets were under 44px tall. | Resource controls, menu links, article navigation, and footer links now provide at least 44px targets. Inline prose links retain their editorial layout. |
| Accessibility | Search used 13px text and tool fields used 15px; standalone worksheet selectors missed the field styles. | Search, topic selectors, and all tool input/select/textarea controls use 16px text and consistent token-based surfaces, borders, and focus indicators. |
| Interaction | Clearing a search removed the focused clear button without returning focus. | Focus returns to the search field; a regression assertion covers this behavior. Search also disables irrelevant autocomplete, spelling, and password-manager overlays. |
| Touch and motion | Hover motion applied regardless of pointer capability or motion preference. | Hover styling requires a fine pointer with hover support. Hover movement additionally requires no reduced-motion preference. |
| Performance | The complete resource directory laid out off-screen rows immediately. | Browser-native `content-visibility` defers off-screen row layout. All 156 resource links remain present in the prerendered HTML and DOM; no links depend on loading another page of results. |
| Polish | Changing tool values and resource counts used proportional digits. | Dynamic tool labels, results, and counts use tabular numerals. |

No new animation library, icon package, font, or runtime dependency was added. Existing CRRT colors, radii, spacing, and page patterns are retained.

## Verification

- Production build: 162 public pages emitted as HTML and Markdown, including all 157 resource URLs.
- Test suite: 3,980 passed; 215 intentionally skipped. Type checks passed.
- Required diff line and branch coverage: 100% against `origin/trunk`.
- At 320px: no horizontal page overflow on the library, converter, or component-state matrix; form text measured 16px, control heights at least 44px.
- Keyboard: Tab reaches clear search; Enter clears and returns focus to search. Escape closes the resource menu and returns focus to its trigger with a visible outline.
- Filters: topic and resource-type combinations, search, empty state, and all-resource reset verified. All 156 links return after clearing search.
- Converter: `rgb(12, 34, 56)` produces `#0C2238`; copy/download controls fit the narrow layout.
- Light/dark switching and worksheet row selection verified.
- Final desktop Lighthouse sample: hub, converter, and component-state matrix each scored 100 in all four categories (one run per page). The final three-run mobile hub recheck also passed at 97/100/100/100 after the footer sizing change.
- Three-run mobile Lighthouse sample: hub 97/100/100/100; converter and component-state matrix 100/100/100/100 (performance/accessibility/best practices/SEO). All applicable agent checks and metric/transfer budgets passed in the stable-build run.

One earlier local run lost an optional ARD-manifest probe while the test suite rebuilt the same output directory. It was recorded as a failure, investigated, and rerun after builds finished; no audit checks or thresholds were disabled. Lighthouse and build-generating tests should run sequentially when sharing this checkout.

The prior exhaustive CI matrix passed 15 of 16 Lighthouse shards; the hub failed the mobile performance/TBT budget (94 performance, 228ms TBT). This change reruns the unchanged budgets in CI. The independent historical mocked-UUID secret-scan finding is still documented in `resources-full-quality.md`; no scanner exception was added.
