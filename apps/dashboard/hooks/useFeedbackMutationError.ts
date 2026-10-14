import { useCallback, useEffect, useRef, useState } from 'react'

export function useFeedbackMutationError(scope: string) {
  const current = useRef({ scope })
  if (current.current.scope !== scope) current.current = { scope }
  const lifetime = current.current
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { setError(''); setBlocked(false) }, [scope])
  const report = useCallback((cause: unknown) => {
    if (current.current !== lifetime) return
    setError(cause instanceof Error ? cause.message : 'Feedback could not be updated. Please retry.')
    if (cause instanceof Error && 'status' in cause && cause.status === 402 && 'resource' in cause && cause.resource === 'subscription') setBlocked(true)
  }, [lifetime])
  return { error, blocked, report }
}
