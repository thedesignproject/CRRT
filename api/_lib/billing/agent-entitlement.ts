import { canProject, effectiveProjectRole, type ProjectRole } from '../project-capabilities.js'
import { getServiceSupabase } from '../supabase.js'
import { getAccount } from './store.js'

export const AGENT_COLLABORATOR_SEAT_LIMIT = 5
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
  const configured = env.CRRT_AGENT_PRICE_IDS || env.STRIPE_PRICE_ID || ''
  return new Map(
    configured.split(',').map((value) => value.trim()).filter(Boolean).map((priceId) => [
      priceId,
      { agent: true as const, collaboratorSeats: AGENT_COLLABORATOR_SEAT_LIMIT },
    ]),
  )
}

export function eligibleAgentPriceIds(env: Record<string, string | undefined> = process.env) {
  return [...agentPlanCatalog(env).keys()]
}

export function hasAgentEntitlement(
  account: { subscription_status: string | null; price_id: string | null } | null,
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    account
      && account.price_id
      && AGENT_ELIGIBLE_SUBSCRIPTION_STATUSES.includes(account.subscription_status as typeof AGENT_ELIGIBLE_SUBSCRIPTION_STATUSES[number])
      && agentPlanCatalog(env).has(account.price_id),
  )
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

  const account = await getAccount(owner.user_id)
  if (!hasAgentEntitlement(account)) {
    return {
      state: actor.is_owner ? 'upgrade_required' : 'owner_upgrade_required',
      role,
      ownerUserId: owner.user_id,
    }
  }

  if (!actor.is_owner) {
    const { data: hasSeat, error: seatError } = await db.rpc('agent_collaborator_has_seat', {
      p_owner: owner.user_id,
      p_actor: actorUserId,
    } as never)
    if (seatError) throw new Error('Agent collaborator seat lookup failed')
    if (hasSeat !== true) {
      return { state: 'seat_limit_reached', role, ownerUserId: owner.user_id, collaboratorSeatLimit: AGENT_COLLABORATOR_SEAT_LIMIT }
    }
  }

  return { state: 'ready', role, ownerUserId: owner.user_id, collaboratorSeatLimit: AGENT_COLLABORATOR_SEAT_LIMIT }
}
