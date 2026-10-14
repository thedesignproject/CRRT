# Storybook onboarding — implementation plan

Linear: TDP-5795

Base: `origin/trunk`

Branch: `feat/tdp-5795-storybook-onboarding`

## Outcome

Expose one CRRT-native Storybook setup flow in the empty project and Project settings, ready to consume TDP-5793's backend without rebuilding the UI.

## Steps

1. Add typed dashboard API functions for Storybook status and short-lived pairing creation.
2. Build a reusable connection component with not-connected, waiting, connected, expired, upgrade, authentication, loading, and recoverable error states.
3. Add populated mock behavior so the complete visual flow can be demonstrated before backend deployment.
4. Add a `Website / App` versus `Storybook` switch to the existing empty-project setup surface.
5. Add the same Storybook integration to Project settings for project admins.
6. Cover state transitions, clipboard behavior, stale requests, project switching, API calls, accessibility, and responsive content with tests.
7. Run typecheck, tests, dashboard build, and 100% line and branch diff coverage against `trunk`.
8. Open a focused PR linked to TDP-5795 and document the final dashboard contract for TDP-5793.

## Rollout safety

The frontend never stores pairing codes, never treats a client-side role check as authorization, and does not alter the existing widget setup. Until TDP-5793 ships, production errors remain explicit while the mock dashboard provides the filming-ready visual path.
