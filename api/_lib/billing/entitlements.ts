import { getServiceSupabase } from '../supabase.js'
import type { CloudPlan, PlanResource } from './plans.js'

export type EntitlementSummary = {
  mode: 'community' | 'cloud'
  isLegacy?: boolean
  plan: CloudPlan | null
  status: string
  canWrite: boolean
  trialUsed: boolean
  resetAt: string | null
  usage: Record<Exclude<PlanResource,'subscription'>, number>
  limits: Record<Exclude<PlanResource,'subscription'>, number | null>
}
export async function ownerEntitlements(ownerId: string): Promise<EntitlementSummary> {
  const { data, error } = await getServiceSupabase().rpc('cloud_entitlements', { p_owner: ownerId })
  if (error || !data) throw new Error('Plan usage is temporarily unavailable')
  return data as EntitlementSummary
}
