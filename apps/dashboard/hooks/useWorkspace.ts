import { useCallback, useEffect, useState } from 'react'
import { getWorkspace, renameWorkspace } from '../api'
import { MOCK_WORKSPACE_NAME, mocksEnabled } from '../lib/mocks'

/** The workspace's name, null until it is named or when it cannot load. `rename` throws so the form can show why. */
export function useWorkspace(apiBase: string, accessToken: string) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setName(null)
    if (mocksEnabled) { setName(MOCK_WORKSPACE_NAME); return }
    getWorkspace(apiBase, accessToken)
      .then((workspace) => { if (active) setName(workspace.name) })
      .catch(() => { /* The sidebar falls back to CRRT. */ })
    return () => { active = false }
  }, [apiBase, accessToken])

  const rename = useCallback(async (next: string) => {
    setName(mocksEnabled ? next : (await renameWorkspace(apiBase, accessToken, next)).name)
  }, [apiBase, accessToken])

  return { name, rename }
}
