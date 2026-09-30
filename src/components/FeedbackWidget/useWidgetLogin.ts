import { useEffect, useMemo, useRef, useState } from 'react'
import { WidgetRequestError, startWidgetLogin, widgetComments, widgetRequest, type WidgetLoginSession } from '../../lib/widgetLogin'

export function useWidgetLogin(apiBase: string, projectKey: string) {
  const [stored, setSession] = useState<{ apiBase: string; projectKey: string; value: WidgetLoginSession } | null>(null)
  const session = stored?.apiBase === apiBase && stored.projectKey === projectKey ? stored.value : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<AbortController | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    setSession(null)
    setBusy(false)
    setError('')
    return () => { generation.current++; attempt.current?.abort(); attempt.current = null }
  }, [apiBase, projectKey])
  async function login() {
    if (attempt.current) return
    generation.current++
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
    const started = generation.current
    try {
      // An expired credential is already unusable and needs no revocation.
      if (Date.parse(session.expiresAt) > Date.now()) await widgetRequest(apiBase, '/v1/widget/auth/exchange', session, { method: 'DELETE' })
    } catch (cause) {
      if (generation.current !== started) return
      // A revoked or expired token is already signed out, including a retry after a lost response.
      if (!(cause instanceof WidgetRequestError && cause.status === 401)) {
        setError((cause as Error).message)
        return
      }
    }
    if (generation.current === started) { setSession(null); setError('') }
  }
  const comments = useMemo(() => session ? widgetComments(apiBase, projectKey, session) : undefined, [apiBase, projectKey, session])
  return { session, comments, busy, error, login, logout, cancel }
}
