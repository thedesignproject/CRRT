import { useEffect, useRef, useState } from 'react'
import type { Comment } from '../types'

export function useLiveSelectors(filteredComments: Comment[]): Set<string> {
  const [liveCommentIds, setLiveCommentIds] = useState<Set<string>>(() => new Set())
  const filteredCommentsRef = useRef(filteredComments)
  filteredCommentsRef.current = filteredComments

  useEffect(() => {
    const recompute = () => {
      const next = new Set<string>()
      for (const c of filteredCommentsRef.current) {
        try { if (document.querySelector(c.selector)) next.add(c.id) } catch { /* invalid selector */ }
      }
      setLiveCommentIds((prev) => {
        if (prev.size !== next.size) return next
        for (const id of next) if (!prev.has(id)) return next
        return prev
      })
    }
    recompute()
    let pending = false
    const obs = new MutationObserver(() => {
      if (pending) return
      pending = true
      window.setTimeout(() => { pending = false; recompute() }, 250)
    })
    obs.observe(document.body, { childList: true, subtree: true, attributes: true })
    return () => obs.disconnect()
  }, [filteredComments])

  return liveCommentIds
}
