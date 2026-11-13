# Speed Insights

The landing site and dashboard initialize `@vercel/speed-insights` through
`apps/speed-insights.ts`. Collection runs only in client production builds on
`crrt.ai`. Local builds, Lighthouse previews, development servers and PR preview
domains do not load the collector. The published widget and extension do not
import it. URLs are reported without query strings or fragments.

Use the free tier for the [crrt.ai project](https://vercel.com/designproject/crrt.ai/speed-insights).
It includes 10,000 events over a rolling 30 days, shared across the Vercel team,
and displays the Real Experience Score. Collection pauses at the limit without
event overage charges. Speed Insights Plus is an optional paid upgrade; this
integration does not enable it. See [Vercel pricing](https://vercel.com/docs/speed-insights/limits-and-pricing).

After merging and deploying through the existing Vercel deployment workflow:

1. Visit `https://crrt.ai/` and `https://crrt.ai/dashboard/` with content blockers
   disabled for the check. Navigate and interact with the pages.
2. Confirm the Speed Insights script loads from `/_vercel/speed-insights/script.js`
   and performance events reach the same project's collection endpoint.
3. Open the project's Speed Insights page and allow time for the first events to
   appear. Do not choose the Plus upgrade to activate free collection.

The existing signed-in project UI was inspected on the MacBook: it showed
“No events collected” and SDK installation/deployment instructions, with Plus
offered separately. Production collection still needs verification after deployment.
