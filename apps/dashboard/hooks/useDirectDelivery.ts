import { useCallback, useEffect, useRef, useState } from 'react'
import { getAgentDelivery, sendAgentDispatch, type AgentDelivery, type AgentListener } from '../api'
import type { Comment } from '../lib/types'
import { mocksEnabled } from '../lib/mocks'

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

const STOPPED = 'This terminal stopped listening. Reconnect it, then send again.'
const NOT_ALLOWED = 'Your role can’t send to this terminal. Ask a project admin for access.'
const NO_PLAN = 'Your plan doesn’t include Agent, so comments can’t be sent to a terminal.'
/** Sends that will fail again as they are; anything else (network, 5xx, unknown) is worth retrying. */
const SEND_ERRORS = new Map([
  ['listener_offline', STOPPED],
  ['listener_stopped', STOPPED],
  ['listener_not_found', STOPPED],
  ['repository_changed', 'This project’s repository changed. Start listening again in the terminal, then send.'],
  ['feedback_changed', 'A comment changed since you opened it. Review it, then send again.'],
  ['feedback_not_eligible', 'A comment isn’t ready for an agent anymore. Check its status in the Inbox.'],
  ['already_sent', 'Some comments are already with an agent.'],
  ['idempotency_conflict', 'This send doesn’t match an earlier attempt. Reload the page, then send again.'],
  // The send path raises forbidden for a missing terminal too, so the message covers both.
  ['forbidden', 'This terminal doesn’t take sends from you. Pick another terminal, or ask a project admin for access.'],
  ['sender_removed', NOT_ALLOWED],
  ['project_access_denied', NOT_ALLOWED],
  ['agent_access_required', NO_PLAN],
  ['upgrade_required', NO_PLAN],
  ['owner_upgrade_required', 'This project’s plan doesn’t include Agent. Ask the project owner to upgrade.'],
  ['seat_limit_reached', 'This project has no Agent seat left for you. Ask the project owner.'],
])

/** Refusals without a code still say why: 403 is the role, 402 the plan. */
export function sendErrorMessage(code: string | undefined, status?: number) {
  return (code && SEND_ERRORS.get(code))
    || (status === 403 ? NOT_ALLOWED : status === 402 ? NO_PLAN : null)
    || 'We couldn’t confirm the send. Send again: comments that already arrived won’t be sent twice.'
}

export interface DirectDelivery {
  /** The Next steps page is open on a project. */
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

/** `onProgress` runs whenever a send changes state, so the caller can reload the comments the terminal moved along. */
export function useDirectDelivery(apiBase: string, accessToken: string, projectId: string | null, active: boolean, onProgress?: () => void): DirectDelivery {
  // The mock preview has no dispatch API, so direct send stays off there.
  const enabled = active && projectId !== null && !mocksEnabled
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
      } catch (failure) {
        if (current !== generation.current) return
        setDelivery((previous) => ({ ...previous, listeners: [] }))
        const { code, status } = failure as { code?: string; status?: number }
        // A role or plan refusal won't change by asking again every few seconds.
        if (status === 402 || status === 403) {
          window.clearInterval(timer)
          setReadError(sendErrorMessage(code, status))
        } else setReadError('Couldn’t check which terminals are listening. Trying again…')
      } finally {
        if (current === generation.current) setChecking(false)
      }
    }
    refresh.current = read
    const timer = window.setInterval(() => { void read() }, POLL_INTERVAL_MS)
    void read()
    return () => {
      generation.current++
      window.clearInterval(timer)
    }
  }, [apiBase, accessToken, projectId, enabled])

  const stateFor = useCallback(
    (commentId: string) => delivery.dispatches.find((dispatch) => dispatch.commentId === commentId)?.state,
    [delivery.dispatches],
  )

  const progress = delivery.dispatches.map((dispatch) => `${dispatch.dispatchId}:${dispatch.state}`).join()
  useEffect(() => {
    if (progress) onProgress?.()
  }, [progress, onProgress])

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
        const { code, status } = failure as { code?: string; status?: number }
        setSendError(sendErrorMessage(code, status))
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
