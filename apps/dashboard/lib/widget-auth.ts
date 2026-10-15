import { parseWidgetAuthRequest, type WidgetAuthRequest } from '../../../src/lib/widgetAuthContract'
import { route } from './routes'

/** Keep the Storybook connection public; the server resolves its project. */
export function widgetAuthContinuation(search: string): (WidgetAuthRequest & { connectionId?: string }) | null {
  const params = new URLSearchParams(search)
  const request = parseWidgetAuthRequest(Object.fromEntries(params))
  if (!request) return null
  const connectionId = params.get('connectionId')
  if (connectionId === null) return request
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(connectionId)) return null
  return { ...request, connectionId }
}

export function widgetAuthRecoveryDestination(search: string, origin: string): string | null {
  const continuation = new URLSearchParams(search).get('continue')
  if (!continuation) return null
  try {
    const url = new URL(continuation, origin)
    if (url.origin !== origin || url.pathname !== route('/widget-auth') || !widgetAuthContinuation(url.search)) return null
    return `${url.pathname}${url.search}`
  } catch { return null }
}
