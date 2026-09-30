import { useEffect, useState } from 'react'
import { parseWidgetAuthRequest, WIDGET_PROOF } from '../../../src/lib/widgetAuthContract'
import { LoginPage } from './LoginPage'

export function WidgetAuthPage({ apiBase, accessToken }: { apiBase: string; accessToken: string | null }) {
  const [status, setStatus] = useState('Connecting to the website…')
  const search = window.location.search
  const request = parseWidgetAuthRequest(Object.fromEntries(new URLSearchParams(search)))
  useEffect(() => {
    if (!accessToken || !request || !window.opener) return
    let active = true
    void fetch(`${apiBase}/v1/widget/auth/handoff`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }).then(async (response) => {
      const result = await response.json()
      if (!response.ok || !WIDGET_PROOF.test(result.code) || result.state !== request.state) throw new Error('Could not connect. Return to the widget and try again.')
      if (!active) return
      window.opener.postMessage({ type: 'crrt:widget-auth', ...result }, request.origin)
      setStatus('Connected. You can close this window.')
    }).catch(() => { if (active) setStatus('Could not connect. Return to the widget and try again.') })
    return () => { active = false }
  }, [accessToken, apiBase, search])
  if (!request || !window.opener) return <main className="p-6">Return to the website and start sign-in from the CRRT widget.</main>
  if (!accessToken) return <LoginPage initialMode="signin" continuationPath={`${window.location.pathname}${search}`} />
  return <main className="min-h-screen flex items-center justify-center bg-background p-6"><p role="status">{status}</p></main>
}
