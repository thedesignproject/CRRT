import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditEvent, AuditRunResponse } from './contracts.js'
import { cancelAudit, getAudit, getAuditEvents } from './browser-client.js'
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled'])
export function latestModelCapacityWait(events: AuditEvent[]) {
  const latest = events[events.length - 1]
  if (latest?.eventType !== 'audit.stage.rate_limited') return null
  const retryAt = typeof latest.payload.retryAt === 'string' ? latest.payload.retryAt : null
  return { stage: latest.stage, retryAt }
}
export function useAuditRun(apiBase: string, auditId: string, accessToken?: string) {
  const [run, setRun] = useState<AuditRunResponse | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const cursor = useRef('0')
  useEffect(() => {
    setRun(null); setEvents([]); setError(null); setCancelling(false)
    cursor.current = '0'
  }, [accessToken, apiBase, auditId])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const eventRequest = getAuditEvents(apiBase, auditId, cursor.current, accessToken, signal).catch(() => null)
    const nextRun = await getAudit(apiBase, auditId, accessToken, signal)
    setRun(nextRun)
    const nextEvents = await eventRequest
    if (nextEvents) {
      setEvents((current) => [...current, ...nextEvents.events.filter((event) => !current.some((item) => item.sequence === event.sequence))])
      cursor.current = nextEvents.nextCursor
    }
    setError(null)
    return nextRun
  }, [accessToken, apiBase, auditId])
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let delay = 1_000
    const poll = async () => {
      try {
        const next = await refresh(controller.signal)
        if (TERMINAL.has(next.status)) return
        delay = 1_000
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Audit polling failed')
        delay = Math.min(delay * 2, 8_000)
      }
      timer = window.setTimeout(poll, delay)
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [refresh])
  const cancel = useCallback(async () => {
    setCancelling(true)
    try {
      const next = await cancelAudit(apiBase, auditId, accessToken)
      setRun(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Audit cancellation failed')
    } finally {
      setCancelling(false)
    }
  }, [accessToken, apiBase, auditId])
  return { run, events, error, cancelling, cancel, refresh }
}
