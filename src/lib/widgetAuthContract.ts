export const WIDGET_PROOF = /^[A-Za-z0-9_-]{43}$/
export type WidgetAuthRequest = { projectKey: string; origin: string; state: string; codeChallenge: string }

export function widgetOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null
    return url.origin === value ? value : null
  } catch { return null }
}

export function parseWidgetAuthRequest(value: Partial<WidgetAuthRequest>): WidgetAuthRequest | null {
  const { projectKey, origin, state, codeChallenge } = value
  if (typeof projectKey !== 'string' || !projectKey || projectKey.length > 200
    || !widgetOrigin(origin) || typeof state !== 'string' || !WIDGET_PROOF.test(state)
    || typeof codeChallenge !== 'string' || !WIDGET_PROOF.test(codeChallenge)) return null
  return { projectKey, origin: origin!, state, codeChallenge }
}
