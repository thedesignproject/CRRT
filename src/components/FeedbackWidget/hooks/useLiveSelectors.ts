import { useCallback, useEffect, useRef, useState } from 'react'
import type { Comment } from '../types'

export function useLiveSelectors(filteredComments: Comment[]): Set<string> {
  const [liveCommentIds, setLiveCommentIds] = useState<Set<string>>(() => new Set())
  const filteredCommentsRef = useRef(filteredComments)
  filteredCommentsRef.current = filteredComments

  const recompute = useCallback(() => {
    const next = new Set<string>()
    for (const c of filteredCommentsRef.current) {
      try { if (document.querySelector(c.selector)) next.add(c.id) } catch { /* invalid selector */ }
    }
    setLiveCommentIds((prev) => {
      if (prev.size !== next.size) return next
      for (const id of next) if (!prev.has(id)) return next
      return prev
    })
  }, [])

  useEffect(() => { recompute() }, [filteredComments, recompute])

  useEffect(() => {
    let timer: number | null = null
    const obs = new MutationObserver(() => {
      if (timer !== null) return
      timer = window.setTimeout(() => { timer = null; recompute() }, 250)
    })
    obs.observe(document.body, { childList: true, subtree: true, attributes: true })
    return () => {
      obs.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [recompute])

  return liveCommentIds
}
