import { useEffect, useState } from 'react'
import type { Project } from '../api'

export function useAccessReviewLink(projects: Project[], loading: boolean, loadError: string | null, open: (key: string) => void) {
  const [pending, setPending] = useState(() => new URLSearchParams(window.location.search).get('accessProject'))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!pending || loading) return
    if (loadError) { setError('Unable to load the requested project. Refresh to try again.'); return }
    const project = projects.find(p => p.publicKey === pending)
    if (project?.capabilities?.includes('project:manage')) {
      setError(null)
      open(pending)
    } else {
      setError('You need to be an owner or admin of this project to review access requests.')
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('accessProject')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setPending(null)
  }, [pending, loading, loadError, projects, open])
  return error
}
