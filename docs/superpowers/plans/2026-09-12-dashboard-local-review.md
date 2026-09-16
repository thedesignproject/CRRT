# Dashboard — local review handoff

## Start

From this worktree run `bun run dev:dashboard:preview`, then open
http://127.0.0.1:4327/dashboard/. This serves the actual React dashboard with existing
fixture data. Supabase and API settings point to localhost with a dummy key, not production.
External integration operations require a test backend and are not live in this preview.

## Delivered visual slice

- Self-hosted Figtree, white/neutral surfaces and scoped orange action tokens.
- Light default, valid dark preference preserved; fix the old class/data-theme mismatch.
- Responsive project sidebar, retained personal comments, search, settings and administration.
- Readable list without faded/struck-through resolved body text.
- Body before image visually, review actions above, Open page beside capture context.
- Explicit Integrations entry point with provider names, preserving the existing provider picker,
  issue preparation, creation and sync UI. Direct provider buttons/logos remain a polish item.
- Existing agent panel starts collapsed and remains available via Show agent panel.

## Verification

- Typecheck and dashboard production build pass.
- Final dashboard suite: 26 files, 173 tests pass.
- Full repository suite before final regression additions: passes on repeat with 2 workers
  and a 15-second test timeout; original parallel run hit a 5-second timeout in an unchanged
  extension test. No extension files were edited to accommodate it.
- Local diff-coverage skill executed. Final changed-line coverage 100%; branch checker passes
  against origin/trunk, the actual branch base d617a1b. Local trunk is stale and includes unrelated
  upstream changes in its comparison; it was not moved because other worktrees share the repo.
- Chrome rendering inspected at 1440x1000 and 390x844. No horizontal document overflow at
  390 or 1024. Computed Figtree family verified, light/dark toggle and persisted dark reload verified.

## Still pending / review boundaries

This is the first visual slice, not the completed three-part redesign. Exact selection-based
agent export and focusing a pin are separate functional slices. Existing bulk controls still
perform review actions, not agent selection. Open page deliberately does not claim to focus a pin.
This preview uses fixtures, not authenticated customer data. Screenshot variety/failure behavior,
all integration states, 200% zoom and complete accessibility validation are not yet visually signed off.
Mobile currently stacks a scrollable list and detail, rather than the final drill-in/back navigation.

No push, PR, merge or deployment. User reviews this local design before any PR.

## 2026-09-16: administración al pie de la navegación

- Se aplica el cambio pedido y confirmado: Project settings y Super admin pasan de la navbar al pie de la barra lateral, con icono y texto. Sin cambios de permisos ni callbacks.
- Footer empujado abajo mediante flex; en móvil aparece debajo de la navegación horizontal, sin posicionamiento absoluto ni superposición.
- Se conservan los tokens, el hover naranja suave y el foco visible; no se modifican otros flujos, privacidad, migraciones ni backend.
- Suite completa: 1387 pruebas pasan, 14 omitidas. Typecheck y build pasan. Diff-cover 100% y ramas sin pendientes contra origin/trunk; trunk local está desactualizado y arroja pendientes ajenos a este cambio.
- Verificación visual pendiente del usuario: el navegador conectado no está disponible en esta sesión. Preview local con datos de prueba en http://127.0.0.1:4327/dashboard/. Sin push ni PR.
