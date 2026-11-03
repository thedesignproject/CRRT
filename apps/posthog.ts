import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST
const isBrowser = !import.meta.env.SSR && import.meta.env.MODE === 'production'

export let isPostHogConfigured = Boolean(isBrowser && apiKey && apiHost)

// Include nested autocapture hrefs and initial/referrer properties as well as pageviews.
function redactUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactUrls)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$elements_chain' && key !== '$el_text').map(([key, item]) => [
    key,
    /url|referrer|href/i.test(key) && typeof item === 'string'
      ? item.split(/[?#]/, 1)[0]
      : redactUrls(item),
  ]))
}

if (isPostHogConfigured) {
  try {
    posthog.init(apiKey, {
      capture_pageview: 'history_change',
      // Product actions are tracked explicitly; never collect feedback DOM content.
      autocapture: false,
      api_host: apiHost,
      before_send: (event) => {
        if (event?.event === '$autocapture') return null
        if (event) event.properties = redactUrls(event.properties) as typeof event.properties
        return event
      },
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    })
  } catch {
    isPostHogConfigured = false
  }
}

// Analytics is optional and must not interrupt a successful product action.
function safely<T extends unknown[]>(action: (...args: T) => unknown) {
  return (...args: T): void => {
    if (!isPostHogConfigured) return
    try { action(...args) } catch { /* Keep analytics failures out of product flows. */ }
  }
}

export default {
  capture: safely((...args: Parameters<typeof posthog.capture>) => posthog.capture(...args)),
  identify: safely((...args: Parameters<typeof posthog.identify>) => posthog.identify(...args)),
  reset: safely(() => posthog.reset()),
}
