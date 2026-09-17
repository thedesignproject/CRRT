import { useCallback, useEffect, useMemo, useState } from 'react'

/** Refresh on focus, serialize actions, and discard responses from obsolete screens. */
export function useAccessResource<T>(load: () => Promise<T>) {
  const scope = useMemo(() => ({ active: true, sequence: 0, busy: false }), [load])
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const sequence = ++scope.sequence
    setLoading(true)
    setError(null)
    try {
      const result = await load()
      if (scope.active && sequence === scope.sequence) setData(result)
    } catch (err) {
      if (scope.active && sequence === scope.sequence) setError(err instanceof Error ? err.message : 'Unable to load project access')
    } finally {
      if (scope.active && sequence === scope.sequence) setLoading(false)
    }
  }, [load, scope])
  useEffect(() => {
    scope.active = true
    setData(null)
    setBusy(false)
    void refresh()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { scope.active = false; window.removeEventListener('focus', onFocus) }
  }, [refresh, scope])
  const run = async (action: () => Promise<unknown>) => {
    if (scope.busy) return false
    scope.busy = true
    setBusy(true)
    setError(null)
    try {
      await action()
      if (!scope.active) return false
      await refresh()
      return scope.active
    } catch (err) {
      if (scope.active) setError(err instanceof Error ? err.message : 'Unable to update project access')
      return false
    } finally {
      scope.busy = false
      if (scope.active) setBusy(false)
    }
  }
  return { data, loading, busy, error, refresh, run }
}
