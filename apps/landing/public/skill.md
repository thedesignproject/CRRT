# CRRT Design Skill for Agents

Use this skill only when a CRRT agent handoff asks you to change UI, visual hierarchy, layout, copy clarity, interaction polish, or product experience.

The CRRT handoff prompt owns the workflow: presence, state, claim, start, complete, and block. This skill only adds design judgment.

CRRT feedback is not always UI work. For backend, data, API, tests, performance, build, docs, or integration feedback, follow the handoff prompt, the local repo conventions, and the smallest relevant verification. Do not force visual-design rules onto non-UI work.

Before applying this skill, classify the feedback:

- UI, visual hierarchy, layout, copy clarity, interaction polish, or product experience: use this skill.
- Non-UI implementation work: follow the handoff prompt and repo conventions.
- Ambiguous: make the smallest reversible change, or ask if the risk is high.

## Design Contract

When changing UI, preserve the product's existing design system.

Do not invent new visual patterns when existing components, tokens, variants, or spacing rules cover the requested change. Prefer the smallest change that satisfies the feedback.

Make the result feel intentional and specific to the product. Avoid generic AI-app aesthetics, but do not redesign the surrounding screen unless the feedback asks for it.

Priority order:

1. Explicit user feedback in the CRRT comment.
2. Local project components and tokens.
3. Existing page patterns.
4. This skill.
5. Generic framework defaults.

If the local system conflicts with this skill, follow the local system unless the CRRT comment explicitly asks for a broader redesign.

## Trust Levels

Use these labels when design context is available:

- `[MANUAL]`: obey exactly. A human wrote it.
- `[RESOLVED]`: safe default. Treat as canonical.
- `[LEARNED]`: use unless the current page contradicts it.
- `[INFERRED]`: use carefully. Verify against nearby code.
- `[UNKNOWN]`: do not guess. Ask or make the smallest reversible change.

## UI Rules

- Reuse existing components before creating new ones.
- Reuse existing tokens before adding raw colors, spacing, shadows, or radii.
- Keep product UI dense, practical, and scannable.
- Keep landing UI brand-led and specific to the product.
- Use icons for tool actions when an icon exists.
- Prefer lucide icons when the project already uses lucide.
- Do not nest cards inside cards.
- Do not add decorative gradients, blobs, or generic hero art unless the page already uses that language.
- Do not introduce oversized hero typography inside dashboards, settings, panels, modals, or tool surfaces.
- Make sure text does not overflow buttons, tabs, table cells, cards, or mobile layouts.
- Check mobile behavior when changing layout, navigation, tables, code blocks, or toolbars.

## CRRT Brand Defaults

Use these only when you are editing CRRT itself or when no stronger client design system exists.

- Dark surfaces with restrained contrast.
- Carrot/orange for primary calls to action and CRRT identity.
- Terminal-adjacent details are allowed, but avoid turning the whole UI into a novelty terminal.
- Mono accents are useful for labels, commands, shortcuts, and IDs.
- Dashboard surfaces should feel like a focused product tool, not a marketing page.
- Landing surfaces can be more expressive, but should still make installation and agent handoff immediately clear.

For app/dashboard UI with no stronger local baseline, this shadcn preset is a useful neutral reference, not a required style:

https://ui.shadcn.com/create?preset=b7BFgTjg8

Preserve CRRT brand overrides when using that reference: dark surface, carrot CTA, terminal/agent feel, compact product UI.

## Intent Mapping

Use these mappings to translate common feedback into implementation direction:

- "CTA looks weak" -> improve hierarchy. Use one primary action per visible region.
- "button does not stand out" -> check variant, contrast, position, and surrounding hierarchy before changing color.
- "too big" -> reduce scale, padding, and line length before changing the whole layout.
- "too small" -> improve hit area and readability without making the whole section larger.
- "not clear how to install" -> show the shortest working install command first.
- "too generic" -> restore product-specific brand signals and concrete product content.
- "too much like Claude" -> reduce generic AI-app styling; make the product and workflow more specific.
- "mobile is broken" -> fix layout constraints, wrapping, overflow, and tap targets first.
- "looks messy" -> align spacing, reduce competing emphasis, and remove unnecessary containers.

## Anti-Patterns

Avoid these unless the existing product intentionally uses them:

- Two primary buttons in the same decision area.
- Layouts where every section is a floating card.
- Cards inside cards.
- Raw Tailwind color guesses when tokens or variants exist.
- New component APIs for one-off changes.
- Large marketing hero treatment inside product workflows.
- Code blocks that hide the actual command or snippet.
- Copy that explains the UI instead of making the UI clear.

## Before Reporting UI Work Complete

Before reporting `comment.complete` for UI/design work:

1. Verify the accepted feedback is actually addressed.
2. Verify nearby UI still matches the local design system.
3. Run the smallest relevant check available: typecheck, unit test, build, or visual/manual verification.
4. Report what changed and what was verified.

If you are blocked, call `comment.block` with a short summary and the specific decision or access you need.
