# Full landing feedback demo

## Approved direction

Let visitors try the complete feedback-to-fix journey from the real landing widget. Reuse its capture, screenshot, pins, review controls, and filters. Offer Claude Code, Codex, Cursor, GitHub, Linear, and Jira as simulated destinations. Keep all demo data local to this tab; never call production handoff APIs or create real tickets, agent runs, or changes.

## Implementation

The local comments adapter owns review state, stable snapshots, subscriptions, and reset. Optional adapter capabilities expose the existing widget review controls and a host-owned Send feedback action. A landing-only native dialog handles selection, destination and request preview, simulated confirmation, illustrative before/after, and explicit approval. Native dialog behavior handles focus containment and Escape; the layout fits desktop and mobile. Empty sessions can start with sample feedback. Existing comments remain available after refresh; reset removes only demo data.

The illustrated before/after is clearly labeled as an example, not an AI-generated resolution of arbitrary visitor feedback. No fabricated external links are opened. The final CTA navigates to the real dashboard only when clicked.

## Verification

Exercise every destination and the empty, rejection, retry, copy, reset, and close paths. Verify no API mutations or external windows occur. Check real-browser desktop/mobile layout and Escape. Run type checks, builds, widget regression tests, and 100% line/branch diff coverage against the document-feedback PR beneath this layer.
