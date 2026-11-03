import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST
const isBrowser = !import.meta.env.SSR && import.meta.env.MODE === 'production'

export let isPostHogConfigured = Boolean(isBrowser && apiKey && apiHost)

if (isPostHogConfigured) {
  try {
    posthog.init(apiKey, {
      capture_pageview: 'history_change',
      api_host: apiHost,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      logs: {
        serviceName: 'crrt-web',
        environment: import.meta.env.MODE,
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
  logger: { info: safely((...args: Parameters<typeof posthog.logger.info>) => posthog.logger.info(...args)) },
}
