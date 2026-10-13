# Dashboard Agent launcher alignment

## Goal

Make the `Agents` launcher visually consistent with the adjacent dashboard controls while connecting ready-work feedback to the existing green readiness language.

## Visual states

- **Available, zero ready:** neutral border, background, icon, and label. No badge or persistent accent.
- **Available, ready work:** the button remains neutral. A compact green `N ready` badge appears and performs one brief, reduced-motion-safe halo when the count changes.
- **Open:** use the dashboard's neutral active surface and foreground treatment, regardless of the ready count. The green badge remains visible when ready work exists.
- **Unavailable:** retain the disabled neutral treatment and explanatory accessible label.

## Sizing

- Match the height, corner radius, horizontal density, and typography of the adjacent `Run audit` button.
- Keep the icon at the existing toolbar scale.
- The ready badge must not increase the control height.

## Behavior and accessibility

- The ready count continues to represent every project comment whose display status is `ready`, independent of the active list filter.
- The button remains available at zero ready so the user can inspect the empty Agent panel.
- Preserve `aria-controls`, `aria-expanded`, the disabled explanation, keyboard access, and reduced-motion behavior.

## Verification

- Component tests cover zero-ready, ready, open, and disabled states.
- Dashboard build and 100% line and branch diff coverage remain green.
