import { useCallback, useEffect, useRef, useState } from 'react'
import { listComments, type CommentRecord } from '../api'
import { getMockComments, mocksEnabled } from '../lib/mocks'

export interface UseCommentsResult {
  comments: CommentRecord[]
  commentsProjectId: string | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useComments(apiBase: string, accessToken: string, projectId: string | null): UseCommentsResult {
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [commentsProjectId, setCommentsProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeProjectRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    activeProjectRef.current = projectId

    if (!projectId) {
      setComments([])
      setCommentsProjectId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    if (mocksEnabled) {
      setComments(getMockComments(projectId))
      setCommentsProjectId(projectId)
      setLoading(false)
      return
    }
    try {
      const data = await listComments(apiBase, accessToken, projectId)
      // Race guard: drop response if user switched projects mid-flight.
      if (activeProjectRef.current !== projectId) return
      setComments(data)
      setCommentsProjectId(projectId)
    } catch (err) {
      if (activeProjectRef.current !== projectId) return
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      if (activeProjectRef.current === projectId) setLoading(false)
    }
  }, [apiBase, accessToken, projectId])

  // Clear previous project's data before the next fetch lands.
  useEffect(() => {
    setComments([])
    setCommentsProjectId(null)
    setLoading(!!projectId)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { comments, commentsProjectId, loading, error, refresh }
}
