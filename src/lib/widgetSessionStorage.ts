import type { WidgetLoginSession } from './widgetLogin'

// Only the origin-bound widget credential is persisted. Never store a dashboard
// or MCP credential on a host website. Storage failure keeps login memory-only.
export function widgetSessionKey(apiBase: string, projectKey: string) {
  return `crrt:widget-session:v1:${JSON.stringify([new URL(apiBase, typeof window === 'undefined' ? 'https://crrt.ai/' : window.location.href).href, projectKey])}`
}
export function readWidgetSession(key: string): WidgetLoginSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (value && /^crrt_widget_[A-Za-z0-9_-]{43}$/.test(value.accessToken)
      && typeof value.displayName === 'string' && value.displayName
      && typeof value.expiresAt === 'string' && Date.parse(value.expiresAt) > Date.now()) return value
    localStorage.removeItem(key)
  } catch { /* unavailable storage or corrupt data must not prevent sign-in */ }
  return null
}
export function writeWidgetSession(key: string, value: WidgetLoginSession | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch { /* private/embedded browsers may deny persistence */ }
}
export const WIDGET_SESSION_REJECTED = 'crrt:widget-session-rejected'
