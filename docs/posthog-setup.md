# PostHog web analytics

The landing site and dashboard initialize PostHog from `apps/posthog.ts` in production builds when both environment variables are present. Development, tests, and server rendering do not send events. Missing configuration or SDK failures leave product actions working.

## Configure Vercel before merging

In the `crrt.ai` Vercel project, open Settings → Environment Variables and add these values for **Production**:

| Variable | Value |
| --- | --- |
| `VITE_POSTHOG_KEY` | Public project token from PostHog project **705236** |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` |

Use the project token, not a personal API key. These values are compiled into browser bundles. A new deployment is required after changing them. Keep local `.env` files out of Git.

For Preview analytics, configure a separate PostHog test project in Vercel's Preview environment to avoid mixing QA traffic into production reports. Local production previews also send events when supplied with a token; use the test project for those builds.

After review and merge to `trunk`, the existing GitHub deployment workflow builds and deploys production to Vercel.

## Verify after deployment

1. Visit `https://crrt.ai` without an analytics blocker, then navigate to another page.
2. Open PostHog project **705236** and confirm fresh `$pageview` events with the correct URL. Client-side history changes are tracked too.
3. Sign in to the dashboard; confirm the authenticated user ID is identified. Sign out and confirm the identity resets.
4. Perform a successful product action, such as copying the agent setup prompt, and confirm its event arrives.

The integration records pageviews, SDK autocapture, unhandled browser errors, and explicit events for demo starts, project creation/invites, feedback review/completion, agent handoffs, external work creation, GitHub/Linear connection, and checkout starts. Explicit events omit feedback text, prompts, and AI completions. Authenticated identity includes user ID and email. Browser logs contain only the two explicit demo/project-created messages.

Before events are sent, URL, referrer, and link properties (including nested initial URL properties) have query strings and fragments removed. Page paths remain available for analytics; invitation email parameters and URL tokens are excluded.

Dashboard: https://us.posthog.com/project/705236/dashboard/2293290
