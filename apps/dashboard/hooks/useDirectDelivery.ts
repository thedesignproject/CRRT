import { useCallback, useEffect, useRef, useState } from 'react'
import { getAgentDelivery, sendAgentDispatch, type AgentDelivery, type AgentListener } from '../api'
import { directSendEnabled } from '../lib/flags'
import type { Comment } from '../lib/types'

const POLL_INTERVAL_MS = 5000
const EMPTY: AgentDelivery = { listeners: [], dispatches: [] }

/** Dispatch states where the comment is already with an agent. */
export const ACTIVE_DISPATCH_STATES = new Set(['queued', 'received', 'working', 'blocked'])

export const DISPATCH_LABELS: Record<string, string> = {
  queued: 'Queued',
  received: 'Received',
  working: 'Agent working',
  blocked: 'Needs your input',
  completed: 'Ready to test',
  cancelled: 'Stopped',
}

export function sendErrorMessage(code: string | undefined) {
  if (code === 'listener_offline' || code === 'listener_stopped') return 'This terminal stopped listening. Reconnect it, then send again.'
  if (code === 'feedback_changed') return 'A comment changed since you opened it. Review it, then send again.'
  if (code === 'already_sent') return 'Some comments are already with an agent.'
  return 'We couldn’t confirm the send. Send again: comments that already arrived won’t be sent twice.'
}

export interface DirectDelivery {
  /** Direct send is switched on and a project is open. */
  enabled: boolean
  listeners: AgentListener[]
  destination: string
  setDestination: (listenerId: string) => void
  /** The chosen terminal is listening right now. */
  online: boolean
  checking: boolean
  busy: boolean
  error: string | null
  stateFor: (commentId: string) => string | undefined
  /** Sends every comment not already with an agent to the chosen terminal. */
  send: (comments: Comment[]) => Promise<void>
}

export function useDirectDelivery(apiBase: string, accessToken: string, projectId: string | null, active: boolean): DirectDelivery {
  const enabled = directSendEnabled && active && projectId !== null
  const [delivery, setDelivery] = useState<AgentDelivery>(EMPTY)
  const [destination, setDestination] = useState('')
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const generation = useRef(0)
  const keys = useRef(new Map<string, string>())
  const refresh = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const current = ++generation.current
    setDelivery(EMPTY)
    setDestination('')
    setReadError(null)
    setSendError(null)
    setBusy(false)
    keys.current.clear()
    if (!enabled) {
      setChecking(false)
      refresh.current = async () => {}
      return
    }
    setChecking(true)
    const read = async () => {
      try {
        const next = await getAgentDelivery(apiBase, accessToken, projectId!)
        if (current !== generation.current) return
        setDelivery(next)
        setReadError(null)
        const listening = next.listeners.filter((listener) => listener.online)
        setDestination((previous) => previous || (listening.length === 1 ? listening[0].listenerId : ''))
      } catch {
        if (current !== generation.current) return
        setDelivery((previous) => ({ ...previous, listeners: [] }))
        setReadError('Couldn’t check which terminals are listening. Trying again…')
      } finally {
        if (current === generation.current) setChecking(false)
      }
    }
    refresh.current = read
    void read()
    const timer = window.setInterval(() => { void read() }, POLL_INTERVAL_MS)
    return () => {
      generation.current++
      window.clearInterval(timer)
    }
  }, [apiBase, accessToken, projectId, enabled])

  const stateFor = useCallback(
    (commentId: string) => delivery.dispatches.find((dispatch) => dispatch.commentId === commentId)?.state,
    [delivery.dispatches],
  )

  const send = useCallback(async (comments: Comment[]) => {
    if (busy || !enabled || !destination) return
    const current = generation.current
    setBusy(true)
    setSendError(null)
    try {
      for (const comment of comments) {
        if (ACTIVE_DISPATCH_STATES.has(stateFor(comment.id) ?? '')) continue
        const signature = JSON.stringify([destination, comment.id, comment.updatedAt])
        const idempotencyKey = keys.current.get(signature) ?? crypto.randomUUID()
        keys.current.set(signature, idempotencyKey)
        await sendAgentDispatch(apiBase, accessToken, projectId!, {
          listenerId: destination,
          commentId: comment.id,
          expectedUpdatedAt: comment.updatedAt,
          idempotencyKey,
        })
      }
    } catch (failure) {
      if (current === generation.current) {
        setSendError(sendErrorMessage((failure as { code?: string }).code))
      }
    } finally {
      if (current === generation.current) {
        setBusy(false)
        await refresh.current()
      }
    }
  }, [apiBase, accessToken, projectId, enabled, destination, busy, stateFor])

  return {
    enabled,
    listeners: delivery.listeners,
    destination,
    setDestination,
    online: delivery.listeners.some((listener) => listener.listenerId === destination && listener.online),
    checking,
    busy,
    error: sendError ?? readError,
    stateFor,
    send,
  }
}
