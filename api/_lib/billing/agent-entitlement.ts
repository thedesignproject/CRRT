import { canProject, effectiveProjectRole, type ProjectRole } from '../project-capabilities.js'
import { getServiceSupabase } from '../supabase.js'
import { getAccount } from './store.js'
import { CLOUD_PLANS, cloudPriceCatalog, isCloud, planForPrice, subscriptionCanWrite, type CloudSubscription } from './plans.js'

export const AGENT_COLLABORATOR_SEAT_LIMIT = CLOUD_PLANS.pro.internal_users - 1
export const AGENT_ELIGIBLE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const

export type WidgetAgentAccessState =
  | 'project_access_denied'
  | 'forbidden'
  | 'upgrade_required'
  | 'owner_upgrade_required'
  | 'seat_limit_reached'
  | 'ready'

export type WidgetAgentAccess = {
  state: WidgetAgentAccessState
  role?: ProjectRole
  ownerUserId?: string
  collaboratorSeatLimit?: number
}

/** Server-only catalog keyed by trusted Stripe price ids. */
export function agentPlanCatalog(env: Record<string, string | undefined> = process.env) {
  if (!isCloud(env)) return new Map([['community', { agent: true as const, collaboratorSeats: Number.MAX_SAFE_INTEGER }]])
  const prices = cloudPriceCatalog(env)
  return new Map([
    [prices.pro, { agent: true as const, collaboratorSeats: CLOUD_PLANS.pro.internal_users - 1 }],
    [prices.studio, { agent: true as const, collaboratorSeats: CLOUD_PLANS.studio.internal_users - 1 }],
  ])
}

export function eligibleAgentPriceIds(env: Record<string, string | undefined> = process.env) {
  return [...agentPlanCatalog(env).keys()]
}

export function hasAgentEntitlement(
  account: (CloudSubscription & { price_id: string | null }) | null,
  env: Record<string, string | undefined> = process.env,
) {
  if (!isCloud(env)) return true
  return Boolean(account && subscriptionCanWrite(account) && planForPrice(account.price_id, env) === account.plan)
}

export async function resolveWidgetAgentAccess(projectKey: string, actorUserId: string): Promise<WidgetAgentAccess> {
  const db = getServiceSupabase()
  const { data: actor, error: actorError } = await db.from('project_members')
    .select('user_id,role,is_owner').eq('project_key', projectKey).eq('user_id', actorUserId).maybeSingle()
  if (actorError) throw new Error('Agent membership lookup failed')
  if (!actor) return { state: 'project_access_denied' }

  const role = effectiveProjectRole(actor.role, actor.is_owner)
  if (!canProject(role, 'agent:operate')) return { state: 'forbidden', role }

  const { data: owner, error: ownerError } = await db.from('project_members')
    .select('user_id').eq('project_key', projectKey).eq('is_owner', true).maybeSingle()
  if (ownerError) throw new Error('Agent owner lookup failed')
  if (!owner) return { state: 'project_access_denied', role }

  if (!isCloud()) return { state: 'ready', role, ownerUserId: owner.user_id }
  const account = await getAccount(owner.user_id)
  if (!hasAgentEntitlement(account)) {
    return {
      state: actor.is_owner ? 'upgrade_required' : 'owner_upgrade_required',
      role,
      ownerUserId: owner.user_id,
    }
  }

  // Membership remains usable after a downgrade; capacity blocks additions only.
  return { state: 'ready', role, ownerUserId: owner.user_id,
    collaboratorSeatLimit: CLOUD_PLANS[account!.plan as 'pro' | 'studio'].internal_users - 1 }
}
