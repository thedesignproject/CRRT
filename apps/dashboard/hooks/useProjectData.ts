import { useCallback, useEffect, useState } from 'react'
import { listAgentRuns, listNextSteps } from '../api'
import { getMockAgentRuns, getMockNextSteps, mocksEnabled } from '../lib/mocks'

/**
 * Loads one project's data, and again whenever `refreshKey` changes or `reload` is called.
 * The last result stays on screen while it reloads; nothing loads without a project.
 */
export function useProjectData<T>(load: (projectKey: string) => Promise<T>, projectKey: string | null, refreshKey: string) {
  const [result, setResult] = useState<{ projectKey: string; data: T | null; error: string | null } | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (!projectKey) return
    let active = true
    load(projectKey).then(
      (data) => { if (active) setResult({ projectKey, data, error: null }) },
      (err) => { if (active) setResult({ projectKey, data: null, error: err instanceof Error ? err.message : 'Could not load' }) },
    )
    return () => { active = false }
  }, [load, projectKey, refreshKey, reloads])

  const current = result?.projectKey === projectKey ? result : null
  const reload = useCallback(() => setReloads((n) => n + 1), [])
  return { data: current?.data ?? null, error: current?.error ?? null, reload }
}

export function useNextSteps(apiBase: string, accessToken: string, projectKey: string | null, refreshKey: string) {
  const load = useCallback((key: string) => mocksEnabled ? Promise.resolve(getMockNextSteps(key)) : listNextSteps(apiBase, accessToken, key), [apiBase, accessToken])
  return useProjectData(load, projectKey, refreshKey)
}

export function useAgentRuns(apiBase: string, accessToken: string, projectKey: string | null, refreshKey: string) {
  const load = useCallback((key: string) => mocksEnabled ? Promise.resolve(getMockAgentRuns(key)) : listAgentRuns(apiBase, accessToken, key), [apiBase, accessToken])
  return useProjectData(load, projectKey, refreshKey)
}
