import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createShare,
  getPrompt,
  getShareEvents,
  getShareState,
  type ShareEventsResponse,
  type ShareState,
} from '../api'
import { mocksEnabled } from '../lib/mocks'

export type PromptTarget = 'claude-code' | 'codex' | 'generic'

export interface AgentSession {
  shareId: string
  slug: string
  token: string
  docUrl: string
}

export interface UseAgentSessionResult {
  session: AgentSession | null
  projectName: string | null
  shareState: ShareState | null
  events: ShareEventsResponse['events']
  error: string | null
  errorCode: string | null
  loading: boolean
  copyPrompt: (target: PromptTarget) => Promise<string>
  adoptSession: (session: AgentSession, commentIds: string[]) => void
}

const POLL_INTERVAL_MS = 4000
const EVENT_LIMIT = 100
const POLL_FAIL_THRESHOLD = 3

export function useAgentSession(apiBase: string, accessToken: string, projectId: string | null, commentIds: string[], enabled = true, ownerId = ''): UseAgentSessionResult {
  const commentIdsKey = commentIds.join('\0')
  const cachedSessions = useRef(new Map<string, { idsKey: string; session: AgentSession }>())
  const cacheIdentity = useRef({ apiBase, ownerId })
  const sessionRevision = useRef(0)
  const contextRef = useRef({ apiBase, projectId, ownerId, generation: 0 })
  const previous = contextRef.current
  const contextChanged = previous.apiBase !== apiBase || previous.projectId !== projectId || previous.ownerId !== ownerId
  contextRef.current = { apiBase, projectId, ownerId, generation: previous.generation + (contextChanged ? 1 : 0) }
  const [session, setSession] = useState<AgentSession | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [shareState, setShareState] = useState<ShareState | null>(null)
  const [events, setEvents] = useState<ShareEventsResponse['events']>([])
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cursorRef = useRef<number>(0)
  const activeProjectRef = useRef<string | null>(null)

  useEffect(() => {
    const projectChanged = activeProjectRef.current !== projectId
    activeProjectRef.current = projectId
    const identityChanged = cacheIdentity.current.apiBase !== apiBase || cacheIdentity.current.ownerId !== ownerId
    if (identityChanged) {
      cachedSessions.current.clear()
      cacheIdentity.current = { apiBase, ownerId }
    }
    const cached = projectId ? cachedSessions.current.get(projectId) : undefined
    if (cached) {
      setSession(cached.session)
      setProjectName(projectId)
      setLoading(false)
      if (projectChanged) {
        setShareState(null)
        setEvents([])
        setError(null)
        setErrorCode(null)
        cursorRef.current = 0
      }
      return
    }
    setLoading(false)
    setSession(null)
    setProjectName(null)
    setShareState(null)
    setEvents([])
    setError(null)
    setErrorCode(null)
    cursorRef.current = 0

    if (!enabled || !projectId || !commentIdsKey) return
    if (commentIds.length > 500) {
      setError('Select up to 500 ready comments in the feedback list to send to Agent.')
      return
    }
    const selectedCommentIds = commentIdsKey.split('\0')

    if (mocksEnabled) {
      setSession({ shareId: `mock-${projectId}`, slug: `mock-${projectId}`, token: 'mock-token', docUrl: `https://docs.example/${projectId}` })
      setProjectName(projectId)
      setLoading(false)
      return
    }

    setLoading(true)

    let cancelled = false
    const revision = ++sessionRevision.current
    createShare(apiBase, accessToken, { projectId, scopeType: 'selection', commentIds: selectedCommentIds })
      .then((res) => {
        if (cancelled || revision !== sessionRevision.current || activeProjectRef.current !== projectId) return
        const next = { shareId: res.shareId, slug: res.slug, token: res.token, docUrl: res.tokenUrl }
        cachedSessions.current.set(projectId, { idsKey: commentIdsKey, session: next })
        setSession(next)
        setProjectName(projectId)
      })
      .catch((err) => {
        if (cancelled || revision !== sessionRevision.current || activeProjectRef.current !== projectId) return
        setError(err instanceof Error ? err.message : 'Could not start session')
        setErrorCode(typeof err === 'object' && err && 'code' in err && typeof err.code === 'string' ? err.code : null)
      })
      .finally(() => {
        if (!cancelled && revision === sessionRevision.current && activeProjectRef.current === projectId) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiBase, accessToken, projectId, commentIdsKey, enabled, ownerId])

  useEffect(() => {
    if (!session || !enabled) return
    if (mocksEnabled) return
    let cancelled = false
    let consecutiveFails = 0

    const tick = async () => {
      const [stateRes, eventsRes] = await Promise.allSettled([
        getShareState(apiBase, session.slug, session.token),
        getShareEvents(apiBase, session.slug, session.token, cursorRef.current),
      ])
      if (cancelled) return

      if (stateRes.status === 'fulfilled') setShareState(stateRes.value)
      if (eventsRes.status === 'fulfilled') {
        const res = eventsRes.value
        if (res.events.length > 0) {
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id))
            const merged = [...prev, ...res.events.filter((e) => !seen.has(e.id))]
            return merged.slice(-EVENT_LIMIT)
          })
          cursorRef.current = res.nextCursor
        }
      }

      const failures = [stateRes, eventsRes].filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      if (failures.length > 0) {
        consecutiveFails++
        for (const f of failures) console.warn('Agent session poll failed', f.reason)
        if (consecutiveFails >= POLL_FAIL_THRESHOLD) {
          setError('Lost connection to agent session — retrying')
        }
      } else if (consecutiveFails > 0) {
        consecutiveFails = 0
        setError(null)
      }
    }

    tick()
    const interval = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiBase, session, enabled])

  const adoptSession = useCallback((next: AgentSession, ids: string[]) => {
    if (!projectId) return
    sessionRevision.current++
    setLoading(false)
    cachedSessions.current.set(projectId, { idsKey: ids.join('\0'), session: next })
    setSession(next)
    setShareState(null)
    setEvents([])
    setError(null)
    setErrorCode(null)
    cursorRef.current = 0
  }, [projectId, ownerId])

  const copyPrompt = useCallback(async (target: PromptTarget) => {
    if (!session) throw new Error('No session yet')
    if (mocksEnabled) {
      const prompt = `# Mock prompt for ${target}\nReview these Ready-for-Agent items at ${session.docUrl}\n(real prompt is generated by /api/v1/shares/.../prompt)`
      await navigator.clipboard.writeText(prompt)
      return prompt
    }
    if (!projectId || commentIds.length === 0 || commentIds.length > 500) throw new Error('Select between 1 and 500 ready comments in the feedback list.')
    const revision = sessionRevision.current
    const generation = contextRef.current.generation
    const isCurrent = () => contextRef.current.apiBase === apiBase && contextRef.current.projectId === projectId && contextRef.current.ownerId === ownerId && contextRef.current.generation === generation && sessionRevision.current === revision
    let current = session
    if (cachedSessions.current.get(projectId)?.idsKey !== commentIdsKey) {
      const share = await createShare(apiBase, accessToken, { projectId, scopeType: 'selection', commentIds })
      if (!isCurrent()) throw new Error('Project changed. Retry the handoff.')
      current = { shareId: share.shareId, slug: share.slug, token: share.token, docUrl: share.tokenUrl }
    }
    const res = await getPrompt(apiBase, accessToken, current.shareId, target)
    if (!isCurrent()) throw new Error('Project changed. Retry the handoff.')
    await navigator.clipboard.writeText(res.prompt)
    if (isCurrent() && current !== session) adoptSession(current, commentIds)
    return res.prompt
  }, [apiBase, accessToken, session, projectId, ownerId, commentIdsKey, adoptSession])

  return { session, projectName, shareState, events, error, errorCode, loading, copyPrompt, adoptSession }
}
