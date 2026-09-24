# Dashboard visual implementation

Approved scope: first visual slice from the September 11 design, delivered as the base of a two-PR stack. Keep coherent commits and preserve current `trunk` behavior while resolving conflicts.

1. Register dashboard-only tokens and self-host Figtree. Respect stored dark preference, default new users to light. Add tests for preference handling. Commit foundation.
2. Move project navigation into a responsive sidebar while retaining search, notifications, settings, audit and personal comments. Restyle list and detail, make integration entry points explicit, keep existing API behavior. Commit layout.
3. Verify existing component tests, new regressions, dashboard build and required diff line/branch coverage. Run isolated local preview with fixtures, not production mutations. Check desktop/mobile rendering where browser tooling permits. Commit tests and fixes.

Do not implement exact selected-comment agent export or pin receiver in this slice. Keep current agent workflow accessible and label it honestly. Record validation limitations; local preview is not production acceptance.
