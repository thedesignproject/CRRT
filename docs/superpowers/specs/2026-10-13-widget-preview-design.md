# Local Widget Preview

## Goal

Provide a zero-configuration local page where the current Agent Bridge widget can be reviewed interactively without a real CRRT project, Supabase session, or connected issue tracker.

## Route and isolation

- Expose `/widget-preview` only when Vite is running in development mode.
- Production builds keep their existing routing and never expose preview fixtures.
- The preview renders the real `PremiumAgentBridge`, not a visual copy.

## Data and behavior

- Seed three representative actionable comments with different review and implementation states.
- Use a fixed mock widget session and project identifier.
- Inject a local service adapter into `PremiumAgentBridge`; its default remains the existing production API implementation.
- Simulate short asynchronous operations for comment mutations, handoff creation, and Linear/GitHub/Jira issue creation.
- Return one distinct external issue URL per selected comment and preserve the widget's duplicate/retry behavior.
- Keep the modal open by default and provide a small page-level control to reopen or reset it after closing.

## Visual treatment

The page is a restrained neutral canvas with a short label explaining that it is a local fixture. The widget itself remains unchanged so the review reflects the actual shipping UI.

## Verification

- Test that the route is development-only.
- Test that fixture comments render and can be selected.
- Test provider switching and one simulated issue per selected comment.
- Run typecheck, focused tests, landing build, and the repository diff-coverage gate.
