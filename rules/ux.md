# UX Rules

## Design Tokens

Source: `branding/CRRT-DESIGN-SYSTEM.md:3-6`, `branding/CRRT-DESIGN-SYSTEM.md:24-190`.

- Treat `branding/CRRT-DESIGN-SYSTEM.md` as the design source of truth.
- Use the CRRT token values from `branding/crrt/tokens.css`; never deviate from them.
- Add new tokens to the token source before using them in implementation.
- Use the semantic color mapping for theme variables; dark theme is default and light theme is opt-in via `[data-theme="light"]`.
- Keep typography within its defined roles: Inter for display/body/UI, JetBrains Mono for code/specs/install commands, and VT323 for CRT voice moments.
- Use the 8-point spacing scale plus the 2px micro step for pixel-aligned details.
- Use the defined radius, elevation, and motion tokens instead of raw ad hoc values.
- Render pixel-art images with the documented pixelated/crisp image-rendering settings.

## UI Feedback Handling

Source: `apps/landing/public/skill.md:3-31`, `apps/landing/public/skill.md:43-55`, `apps/landing/public/skill.md:74-110`.

- Use this skill only for UI, visual hierarchy, layout, copy clarity, interaction polish, or product experience feedback.
- For non-UI work, follow the CRRT handoff prompt, local repo conventions, and the smallest relevant verification.
- For ambiguous feedback, make the smallest reversible change or ask when risk is high.
- Preserve the product's existing design system when changing UI.
- Reuse existing components, tokens, variants, spacing rules, and nearby page patterns before creating new visual patterns.
- Do not redesign surrounding screens unless the feedback asks for it.
- Reuse existing components before creating new ones.
- Reuse existing tokens before adding raw colors, spacing, shadows, or radii.
- Keep product UI dense, practical, and scannable.
- Keep landing UI brand-led and specific to the product.
- Use icons for tool actions when an icon exists; prefer lucide icons when the project already uses lucide.
- Do not nest cards inside cards.
- Do not add decorative gradients, blobs, or generic hero art unless the page already uses that language.
- Do not introduce oversized hero typography inside dashboards, settings, panels, modals, or tool surfaces.
- Make sure text does not overflow buttons, tabs, table cells, cards, or mobile layouts.
- Check mobile behavior when changing layout, navigation, tables, code blocks, or toolbars.
- Before reporting UI work complete, verify the accepted feedback is addressed, nearby UI still matches the local design system, a relevant check ran, and the report says what changed and what was verified.
- If blocked, call `comment.block` with a short summary and the specific decision or access needed.

## Component Specs

Source: `branding/AGENTIC-DESIGN-SYSTEM.md:3-5`, `branding/AGENTIC-DESIGN-SYSTEM.md:34-55`, `branding/AGENTIC-DESIGN-SYSTEM.md:160-207`.

- Convention (rollout in progress): place a `<ComponentName>.meta.ts` file next to each component implementation.
- Convention (rollout in progress): export one named `meta` constant per meta file; do not use default exports.
- Convention (rollout in progress): make the meta filename match the component name and end in `.meta.ts`.
- Convention (rollout in progress): document identity, usage guidance, API props/events/slots, design tokens, composition, behavior/a11y, motion, and examples.
- Convention (rollout in progress): keep descriptions to one sentence, make `whenToUse` bullets imperative, name alternatives in `whenNotToUse`, list every consumed token, match every prop to the actual component API, and make examples compile.
- Convention (rollout in progress): when using component meta, filter deprecated and experimental components unless the user opts in, confirm fit from `whenToUse` and `whenNotToUse`, start from the first example, and walk internal dependencies.

