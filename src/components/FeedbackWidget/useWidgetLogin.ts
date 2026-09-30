import { useEffect, useMemo, useRef, useState } from 'react'
import { startWidgetLogin, widgetComments, widgetRequest, type WidgetLoginSession } from '../../lib/widgetLogin'

export function useWidgetLogin(apiBase: string, projectKey: string) {
  const [stored, setSession] = useState<{ apiBase: string; projectKey: string; value: WidgetLoginSession } | null>(null)
  const session = stored?.apiBase === apiBase && stored.projectKey === projectKey ? stored.value : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<AbortController | null>(null)
  useEffect(() => {
    setSession(null)
    setBusy(false)
    setError('')
    return () => { attempt.current?.abort(); attempt.current = null }
  }, [apiBase, projectKey])
  async function login() {
    if (attempt.current) return
    const controller = new AbortController()
    attempt.current = controller
    setBusy(true); setError('')
    try {
      const next = await startWidgetLogin(apiBase, projectKey, controller.signal)
      if (!controller.signal.aborted) setSession({ apiBase, projectKey, value: next })
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message)
    } finally {
      if (attempt.current === controller) { attempt.current = null; setBusy(false) }
    }
  }
  function cancel() { attempt.current?.abort(); attempt.current = null; setBusy(false) }
  async function logout() {
    if (!session) return
    try {
      // An expired credential is already unusable and needs no revocation.
      if (Date.parse(session.expiresAt) > Date.now()) await widgetRequest(apiBase, '/v1/widget/auth/exchange', session, { method: 'DELETE' })
      setSession(null); setError('')
    } catch (cause) { setError((cause as Error).message) }
  }
  const comments = useMemo(() => session ? widgetComments(apiBase, projectKey, session) : undefined, [apiBase, projectKey, session])
  return { session, comments, busy, error, login, logout, cancel }
}
