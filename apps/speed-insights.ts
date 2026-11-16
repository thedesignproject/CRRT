import { injectSpeedInsights } from '@vercel/speed-insights'

// Collect real production traffic, without loading Vercel's script in local
// builds, Lighthouse audits, or PR previews (the free quota is shared by team).
if (import.meta.env.PROD && !import.meta.env.SSR && location.hostname === 'crrt.ai') {
  injectSpeedInsights({
    framework: 'react',
    // Match our analytics privacy policy: omit invite tokens, queries and hashes.
    beforeSend: event => ({ ...event, url: event.url.split(/[?#]/, 1)[0] }),
  })
}
