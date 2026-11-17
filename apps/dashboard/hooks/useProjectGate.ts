import { useEffect, useState } from 'react'
import { billingStatusOnce } from '../lib/billing-availability'

export type ProjectGate = { planRequired: boolean; trialAvailable: boolean }

// Whether creating a project needs a Cloud plan first. A hint for routing the
// "create project" actions to Billing; the API still enforces every write.
export function useProjectGate(apiBase: string, userId: string, accessToken: string): ProjectGate {
  const [gate, setGate] = useState<ProjectGate>({ planRequired: false, trialAvailable: false })
  useEffect(() => {
    let active = true
    void billingStatusOnce(apiBase, userId, accessToken).then(({ planRequired, trialAvailable }) => {
      if (active) setGate({ planRequired, trialAvailable })
    })
    return () => { active = false }
  }, [apiBase, userId, accessToken])
  return gate
}
