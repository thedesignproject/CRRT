import { WIDGET_PROOF } from './widgetAuthContract'
import type { PersonalComments } from '../components/FeedbackWidget/types'

export type WidgetLoginSession = { accessToken: string; displayName: string; expiresAt: string }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function widgetRequest(apiBase: string, path: string, session: WidgetLoginSession, init: RequestInit = {}) {
  if (Date.parse(session.expiresAt) <= Date.now()) throw new Error('Session expired. Log in to CRRT again.')
  const response = await fetch(`${apiBase}${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Log in to CRRT again.' : 'Could not save or load feedback. Please try again.')
  return response
}

export function widgetComments(apiBase: string, projectKey: string, session: WidgetLoginSession): PersonalComments {
  return {
    label: 'My feedback',
    list: async () => (await widgetRequest(apiBase, '/v1/widget/comments', session)).json(),
    create: async (payload) => (await widgetRequest(apiBase, '/v1/public/comments', session, {
      method: 'POST', body: JSON.stringify({ ...payload, projectKey }),
    })).json(),
    update: async (id, body) => widgetRequest(apiBase, `/v1/widget/comments?id=${encodeURIComponent(id)}`, session, { method: 'PATCH', body: JSON.stringify({ body }) }),
    remove: async (id) => { await widgetRequest(apiBase, `/v1/widget/comments?id=${encodeURIComponent(id)}`, session, { method: 'DELETE' }) },
  }
}

export async function startWidgetLogin(apiBase: string, projectKey: string, signal: AbortSignal): Promise<WidgetLoginSession> {
  // Open synchronously in the click handler, before awaiting Web Crypto.
  const popup = window.open('about:blank', '_blank', 'popup,width=480,height=720')
  if (!popup) throw new Error('Allow popups to log in to CRRT.')
  try {
    const verifier = encode(crypto.getRandomValues(new Uint8Array(32)))
    const state = encode(crypto.getRandomValues(new Uint8Array(32)))
    const codeChallenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
    const url = new URL('/dashboard/widget-auth', new URL(apiBase, window.location.href))
    url.search = new URLSearchParams({ projectKey, origin: window.location.origin, state, codeChallenge }).toString()
    const code = await new Promise<string>((resolve, reject) => {
      function finish(error: string | null, value = '') {
        window.removeEventListener('message', receive)
        signal.removeEventListener('abort', abort)
        window.clearInterval(timer)
        window.clearTimeout(timeout)
        if (error) reject(new Error(error)); else resolve(value)
      }
      function abort() { finish('Sign-in cancelled.') }
      function receive(event: MessageEvent) {
        if (event.origin !== url.origin || event.source !== popup || event.data?.type !== 'crrt:widget-auth'
          || event.data.state !== state || typeof event.data.code !== 'string' || !WIDGET_PROOF.test(event.data.code)) return
        finish(null, event.data.code)
      }
      const timer = window.setInterval(() => { if (popup.closed) finish('Sign-in window closed. Try again or continue as guest.') }, 500)
      const timeout = window.setTimeout(() => finish('Sign-in timed out. Please try again.'), 5 * 60_000)
      window.addEventListener('message', receive)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else popup.location.href = url.href
    })
    const response = await fetch(`${apiBase}/v1/widget/auth/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ code, state, verifier, projectKey }),
    })
    const result = await response.json()
    if (!response.ok || typeof result.accessToken !== 'string' || !/^crrt_widget_[A-Za-z0-9_-]{43}$/.test(result.accessToken)
      || typeof result.displayName !== 'string' || !result.displayName
      || typeof result.expiresAt !== 'string' || !(Date.parse(result.expiresAt) > Date.now())) throw new Error('Could not complete CRRT sign-in. Please try again.')
    return result
  } finally { popup.close() }
}
