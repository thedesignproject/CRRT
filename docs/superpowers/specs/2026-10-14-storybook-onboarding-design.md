# Storybook onboarding inside CRRT

Linear: TDP-5795

## Goal

Let a CRRT Pro project owner connect an existing Storybook without leaving the project or understanding CRRT's package architecture. The primary path is one copyable command and a visible connection result.

## Product boundary

- Storybook is a CRRT Pro integration, not a separate CRRT product or dashboard.
- The empty-project setup surface offers `Website / App` and `Storybook` as two ways to bring feedback into the same project.
- Project settings keeps the Storybook connection available after feedback exists.
- The command contains a short-lived pairing code, never an account token or reusable project secret.
- CRRT continues to own feedback review and Agent handoff after a Storybook comment arrives.

## Chosen approach

Use one reusable Storybook connection component in both the empty-project setup surface and Project settings.

Alternatives rejected:

1. A standalone Storybook page or microsite adds navigation and makes the integration feel like another product.
2. Showing Storybook only in the empty state makes the connection impossible to revisit after feedback arrives.
3. Showing raw manual configuration first exposes implementation details and creates avoidable setup errors.

## Experience

### Empty project

The current setup card gains a two-option switch:

- `Website / App` preserves the existing npm and mount snippets.
- `Storybook` presents the connection component for the selected project.

The choice changes only the setup content; it does not create a different project type.

### Project settings

Admins see a `Storybook` integration section near the existing GitHub, Linear, and Jira integrations. Non-admins do not receive or generate pairing codes.

### States

- **Loading:** compact spinner with an explicit loading label.
- **Not connected:** plain explanation and one `Connect Storybook` action.
- **Waiting:** one copyable `npx @thedesignproject/crrt-storybook connect --code …` command, expiration guidance, and `Check connection`.
- **Connected:** success status, optional Storybook deep link, last verification metadata, and an option to generate a fresh command.
- **Expired:** explains that nothing local was changed and offers a fresh command.
- **Upgrade required:** explains that Storybook belongs to Pro and routes the owner to the existing checkout flow.
- **Authentication required:** asks the user to refresh their CRRT session before retrying.
- **Error:** retains the last safe state when possible and offers a concrete retry.

`Advanced` remains collapsed by default and contains compatibility and diagnostic information: Storybook 10 + React, Node 20.19+, and the `doctor` command.

## Frontend contract

The frontend isolates Pranav's backend contract behind two functions:

- `GET /v1/projects/:projectKey/storybook` returns the current connection or active pairing.
- `POST /v1/projects/:projectKey/storybook/pairings` creates a short-lived, project-scoped pairing.

The UI consumes stable states (`not_connected`, `waiting`, `connected`, `upgrade_required`) and derives `expired`, `authentication_required`, and generic failure states from expiry and HTTP errors. Endpoint mapping remains confined to `apps/dashboard/api.ts` so the UI does not change if the final backend route naming differs.

## Security and recovery

- Pairing generation requires an authenticated project admin and is still enforced server-side.
- The command is rendered as sensitive, ephemeral setup material and is never stored in local storage.
- Clipboard failure leaves the command selectable and announces a concrete error.
- A stale response from a previously selected project cannot replace the current project's state.
- Refreshing status never creates a new pairing.
- Generating a fresh command is explicit.

## Visual system and accessibility

- Reuse the dashboard's existing card, button, badge, code, spacing, and focus language.
- Keep the command as the single visual focus; do not nest cards or add decorative artwork.
- Tabs, copy, retry, disclosure, and links remain keyboard accessible.
- Status changes use `aria-live`; errors use `role="alert"`.
- The layout stacks cleanly on narrow viewports and long commands wrap or scroll without clipping.

## Testing

- Component tests cover every state, copy success/failure, refresh, regeneration, upgrade, project changes, keyboard semantics, and stale async responses.
- Empty-state tests verify both setup choices without regressing the widget instructions.
- API tests verify authenticated methods, encoded project keys, and response bodies.
- Typecheck, dashboard build, full tests, and 100% line and branch diff coverage are required.

