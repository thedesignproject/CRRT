import { useEffect, useState } from 'react'
import { getStorybookIntegration } from '../api'
import { mocksEnabled } from '../lib/mocks'

/**
 * Whether the project already has a connected Storybook: true or false once known, null
 * while loading, when disabled, or when the check fails. Read-only: it never starts a pairing.
 */
export function useStorybookConnected(apiBase: string, accessToken: string, projectKey: string, enabled: boolean): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null)
  useEffect(() => {
    setConnected(null)
    if (!enabled || !projectKey || mocksEnabled) return
    let active = true
    getStorybookIntegration(apiBase, accessToken, projectKey).then(
      (integration) => { if (active) setConnected(integration.state === 'connected') },
      () => { /* Unknown stays null: the row and checklist fall back to "not connected" wording. */ },
    )
    return () => { active = false }
  }, [apiBase, accessToken, projectKey, enabled])
  return connected
}
