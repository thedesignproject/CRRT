# CRRT Pro Storybook connection implementation plan

Design: `docs/superpowers/specs/2026-10-13-crrt-pro-storybook-connection-design.md`

1. Add a testable Node CLI core for project/package-manager detection, pairing validation/claim, official Storybook addon installation, atomic config writes, and `doctor` diagnostics.
2. Package the existing manager panel as a Storybook 10 ESM preset that reads `.storybook/crrt.json` and injects only public connection metadata.
3. Preserve parameter-based public-project behavior while adding typed connected/private eligibility states for the backend contract in TDP-5793.
4. Add built-artifact tests, CLI tests, a Storybook fixture/build gate, package-content verification, and GitHub CI.
5. Update installation and compatibility documentation, run the full verification suite, and open a reviewable PR linked to TDP-5796.

Each step must leave the existing four DOM checks, manual feedback, structured dispatch, and story context working.

## Panel design calibration

- Color: inherit Storybook's theme; CRRT orange `#F26419` marks actions, green `#1D7A3E` confirms a verified connection, red `#B42318` is reserved for failures, and neutral translucent grays work in both themes.
- Type: inherit Storybook's interface typeface so CRRT feels native; keep the existing monospace treatment only for rule identifiers.
- Layout: keep one compact panel column. Connection problems use a flat horizontal status band with a three-pixel leading rule, not another rounded product card.
- Copy: sentence case, direct recovery actions, and the same CRRT terminology as the dashboard.

The first pass considered a badge/card for every connection state. That read as generic SaaS chrome and made CRRT look embedded as a separate product. The revised design shows no extra surface when ready beyond one quiet status line; it introduces the flat band only when the user must wait or act.
