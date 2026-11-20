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

/** Don't reload more often than this when people come back to the tab. */
export const QUOTA_REFRESH_MS = 60_000

/**
 * Loads the quota per account, and again when people return to the tab (at most once a
 * minute), so usage from this session shows up. Billing is optional: self-hosted or failed
 * loads show nothing.
 */
export function usePlanQuota(apiBase: string, accessToken: string, userId: string): PlanQuota | null {
  const [quota, setQuota] = useState<PlanQuota | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let last = Date.now()
    const onReturn = () => {
      if (document.visibilityState === 'hidden' || Date.now() - last < QUOTA_REFRESH_MS) return
      last = Date.now()
      setRefresh((n) => n + 1)
    }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [])

  useEffect(() => {
    let active = true
    void billingAvailabilityOnce(apiBase, userId, accessToken)
      .then((enabled) => (enabled ? getBillingSummary(apiBase, accessToken) : null))
      .then((summary) => { if (active) setQuota(summary ? planQuota(summary) : null) })
      .catch(() => { if (active) setQuota(null) })
    return () => { active = false }
  }, [apiBase, accessToken, userId, refresh])
  return quota
}
