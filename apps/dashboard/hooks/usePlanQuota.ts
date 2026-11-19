import { useEffect, useState } from 'react'
import { getBillingSummary, type BillingSummary } from '../api'
import { billingAvailabilityOnce } from '../lib/billing-availability'

export type PlanQuota = { plan: string; used: number; limit: number; canUpgrade: boolean }

/** The plan's monthly comment allowance, the limit customers hit first. Null when unmetered. */
export function planQuota(summary: BillingSummary): PlanQuota | null {
  const comments = summary.usage?.comments
  if (!summary.plan || !comments || comments.limit === null) return null
  return {
    plan: summary.plans?.find((plan) => plan.key === summary.plan)?.name ?? summary.plan,
    used: comments.used,
    limit: comments.limit,
    canUpgrade: summary.canManage === true || summary.canManageSubscription === true,
  }
}

/** Loads the quota once per account. Billing is optional: self-hosted or failed loads show nothing. */
export function usePlanQuota(apiBase: string, accessToken: string, userId: string): PlanQuota | null {
  const [quota, setQuota] = useState<PlanQuota | null>(null)
  useEffect(() => {
    let active = true
    void billingAvailabilityOnce(apiBase, userId, accessToken)
      .then((enabled) => (enabled ? getBillingSummary(apiBase, accessToken) : null))
      .then((summary) => { if (active) setQuota(summary ? planQuota(summary) : null) })
      .catch(() => { if (active) setQuota(null) })
    return () => { active = false }
  }, [apiBase, accessToken, userId])
  return quota
}
