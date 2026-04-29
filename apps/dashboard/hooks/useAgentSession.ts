import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchProjectSession,
  getPromptByShare,
  getShareEvents,
  getShareState,
  type ProjectSessionResponse,
  type ShareEventsResponse,
  type ShareState,
} from '../api'

export type PromptTarget = 'claude-code' | 'codex' | 'generic'

export interface AgentSession {
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
  loading: boolean
  copyPrompt: (target: PromptTarget) => Promise<string>
}

const POLL_INTERVAL_MS = 4000
const EVENT_LIMIT = 100

export function useAgentSession(apiBase: string, projectId: string | null): UseAgentSessionResult {
  const [session, setSession] = useState<AgentSession | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [shareState, setShareState] = useState<ShareState | null>(null)
  const [events, setEvents] = useState<ShareEventsResponse['events']>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const cursorRef = useRef<number>(0)
  const activeProjectRef = useRef<string | null>(null)

  useEffect(() => {
    activeProjectRef.current = projectId
    setSession(null)
    setProjectName(null)
    setShareState(null)
    setEvents([])
    setError(null)
    cursorRef.current = 0

    if (!projectId) return
    setLoading(true)

    let cancelled = false
    fetchProjectSession(apiBase, projectId)
      .then((res: ProjectSessionResponse) => {
        if (cancelled || activeProjectRef.current !== projectId) return
        setSession({ slug: res.doc.slug, token: res.doc.token, docUrl: res.doc.docUrl })
        setProjectName(res.projectName)
      })
      .catch((err) => {
        if (cancelled || activeProjectRef.current !== projectId) return
        setError(err instanceof Error ? err.message : 'Could not start session')
      })
      .finally(() => {
        if (!cancelled && activeProjectRef.current === projectId) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [apiBase, projectId])

  useEffect(() => {
    if (!session) return
    let cancelled = false

    const refreshState = () => {
      getShareState(apiBase, session.slug, session.token)
        .then((next) => {
          if (!cancelled) setShareState(next)
        })
        .catch(() => {})
    }

    const refreshEvents = () => {
      getShareEvents(apiBase, session.slug, session.token, cursorRef.current)
        .then((res) => {
          if (cancelled) return
          if (res.events.length > 0) {
            setEvents((prev) => {
              const seen = new Set(prev.map((e) => e.id))
              const merged = [...prev, ...res.events.filter((e) => !seen.has(e.id))]
              return merged.slice(-EVENT_LIMIT)
            })
            cursorRef.current = res.nextCursor
          }
        })
        .catch(() => {})
    }

    refreshState()
    refreshEvents()
    const stateInterval = window.setInterval(refreshState, POLL_INTERVAL_MS)
    const eventsInterval = window.setInterval(refreshEvents, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(stateInterval)
      window.clearInterval(eventsInterval)
    }
  }, [apiBase, session])

  const copyPrompt = useCallback(async (target: PromptTarget) => {
    if (!session) throw new Error('No session yet')
    const res = await getPromptByShare(apiBase, session.slug, session.token, target)
    await navigator.clipboard.writeText(res.prompt)
    return res.prompt
  }, [apiBase, session])

  return { session, projectName, shareState, events, error, loading, copyPrompt }
}
