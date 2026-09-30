import { parseWidgetAuthRequest } from '../../../src/lib/widgetAuthContract'
import { route } from './routes'

export function widgetAuthRecoveryDestination(search: string, origin: string): string | null {
  const continuation = new URLSearchParams(search).get('continue')
  if (!continuation) return null
  try {
    const url = new URL(continuation, origin)
    if (url.origin !== origin || url.pathname !== route('/widget-auth') || !parseWidgetAuthRequest(Object.fromEntries(url.searchParams))) return null
    return `${url.pathname}${url.search}`
  } catch { return null }
}
