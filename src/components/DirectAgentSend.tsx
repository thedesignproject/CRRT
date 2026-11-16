import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { fetchDelivery, sendFeedback, type DeliveryState } from './FeedbackWidget/dispatch'
import type { WidgetAgentComment } from './FeedbackWidget/api'
import { WidgetRequestError, type WidgetLoginSession } from '../lib/widgetLogin'

const statusLabels: Record<string, string> = { queued: 'Queued', received: 'Received', working: 'Working', blocked: 'Needs your input', completed: 'Ready to test', cancelled: 'Stopped — review feedback' }
const activeStates = new Set(['queued', 'received', 'working', 'blocked'])
const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '4px 10px', border: '1px solid var(--fw-contrast-10)', borderRadius: 8, background: 'var(--fw-contrast-06)', color: 'var(--fw-foreground)', cursor: 'pointer', font: 'inherit', fontSize: 12 }
export type DirectSendControls = { action: (comment: WidgetAgentComment) => ReactNode }
export function DirectAgentSend({ apiBase, projectId, pageUrl, session, onSent, children }: {
  apiBase: string; projectId: string; pageUrl: string; session: WidgetLoginSession;
  onSent: () => void; children: (controls: DirectSendControls) => ReactNode
}) {
  const [delivery, setDelivery] = useState<DeliveryState>({ listeners: [], dispatches: [] })
  const [destination, setDestination] = useState('')
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false), generation = useRef(0), readSequence = useRef(0)
  const keys = useRef(new Map<string, string>())
  const refresh = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    const current = ++generation.current
    setDelivery({ listeners: [], dispatches: [] }); setDestination(''); setChecking(true); setError(''); setReadError(''); setBusy(false)
    sending.current = false; keys.current.clear()
    const read = async () => {
      const sequence = ++readSequence.current
      try {
        const next = await fetchDelivery(apiBase, projectId, pageUrl, session)
        if (current !== generation.current || sequence !== readSequence.current) return
        setDelivery(next); setReadError('')
        const available = next.listeners.filter(item => item.online)
        setDestination(previous => previous || (available.length === 1 ? available[0].listenerId : ''))
      } catch {
        if (current !== generation.current || sequence !== readSequence.current) return
        setDelivery(previous => ({ ...previous, listeners: [] }))
        setReadError('Could not check terminal availability. Reconnect or try again shortly.')
      } finally { if (current === generation.current) setChecking(false) }
    }
    refresh.current = read
    void read()
    const timer = window.setInterval(() => { void read() }, 5000)
    return () => { generation.current++; window.clearInterval(timer) }
  }, [apiBase, projectId, pageUrl, session])

  async function send(comment: WidgetAgentComment) {
    if (sending.current) return
    sending.current = true; setBusy(true); setError('')
    const current = generation.current
    const signature = JSON.stringify([destination, comment.id, comment.updatedAt])
    let key = keys.current.get(signature)
    if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key) }
    try {
      await sendFeedback(apiBase, session, { projectKey: projectId, pageUrl, listenerId: destination,
        commentId: comment.id, expectedUpdatedAt: comment.updatedAt!, idempotencyKey: key })
      if (current !== generation.current) return
      onSent()
      await refresh.current()
    } catch (failure) {
      if (current !== generation.current) return
      const code = failure instanceof WidgetRequestError ? failure.code : undefined
      setError(code === 'listener_offline' ? 'This terminal stopped listening. Reconnect it before sending.'
        : code === 'feedback_changed' ? 'Feedback changed. Refresh and review it before sending.'
        : code === 'already_sent' ? 'This feedback is already queued. Check its status before sending again.'
        : 'Delivery could not be confirmed. Retry this same SEND to recover its result safely.')
    } finally { if (current === generation.current) { sending.current = false; setBusy(false) } }
  }
  const online = delivery.listeners.some(item => item.listenerId === destination && item.online)
  return <>
    <section aria-label="Direct delivery" style={{ marginBottom: 16, fontSize: 13, color: 'var(--fw-foreground-muted)' }}>
      <label style={{ display: 'grid', gap: 6 }}>Send to terminal
        <select aria-label="Send to terminal" value={destination} disabled={busy || checking} onChange={event => setDestination(event.target.value)} style={{ ...buttonStyle, width: '100%', minWidth: 0, background: 'var(--fw-surface-deep)' }}>
          <option value="">Choose a listening terminal</option>
          {delivery.listeners.map(item => <option key={item.listenerId} value={item.listenerId} disabled={!item.online}>{item.label} · {item.online ? 'Listening' : 'Offline'}</option>)}
        </select>
      </label>
      {delivery.listeners.filter(item => item.listenerId === destination).map(item => <p key={item.listenerId} style={{ margin: '6px 0', fontSize: 12, overflowWrap: 'anywhere' }}>{item.repoUrl}</p>)}
      <p role="status" style={{ margin: '8px 0', lineHeight: 1.5 }}>{checking ? 'Checking terminals…' : online ? 'SEND accepts this comment and starts implementation. Merge and deploy are separate.' : 'No selected terminal is listening. Ask your connected agent to listen for CRRT SEND requests in this repository.'}</p>
      {(error || readError) && <p role="alert" style={{ color: 'var(--fw-danger-label)', lineHeight: 1.5 }}>{error || readError}</p>}
    </section>
    {children({ action: comment => {
      const state = delivery.dispatches.find(item => item.commentId === comment.id)?.state
      const eligible = comment.implementationStatus === 'unassigned' && comment.reviewStatus !== 'rejected' && Boolean(comment.updatedAt)
      return <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <button type="button" aria-label={`SEND: ${comment.body}`} disabled={busy || !online || !eligible || activeStates.has(state ?? '')} onClick={() => { void send(comment) }} style={buttonStyle}><Send size={13} aria-hidden="true" /> SEND</button>
        {state && <span role="status">{statusLabels[state] ?? 'Checking delivery'}</span>}
      </span>
    } })}
  </>
}
