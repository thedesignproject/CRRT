import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./store.js', () => ({ getAccount: vi.fn() }))
import { getServiceSupabase } from '../supabase.js'
import { getAccount } from './store.js'
import {
  AGENT_COLLABORATOR_SEAT_LIMIT,
  agentPlanCatalog,
  eligibleAgentPriceIds,
  hasAgentEntitlement,
  resolveWidgetAgentAccess,
} from './agent-entitlement.js'

let results: Array<{ data: unknown; error: unknown }>
beforeEach(() => {
  vi.resetAllMocks()
  results = []
  const from = vi.fn(() => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) query[method] = vi.fn(() => query)
    query.maybeSingle = vi.fn(async () => results.shift())
    return query
  })
  vi.mocked(getServiceSupabase).mockReturnValue({ from } as never)
  vi.mocked(getAccount).mockResolvedValue({ subscription_status: 'active', price_id: 'price_agent' } as never)
  vi.stubEnv('STRIPE_PRICE_ID', 'price_agent')
  vi.stubEnv('CRRT_AGENT_PRICE_IDS', '')
})

it('builds a trimmed server-only price catalog and recognizes only eligible states', () => {
  expect([...agentPlanCatalog({ CRRT_AGENT_PRICE_IDS: ' price_a,price_b,price_a ' }).keys()]).toEqual(['price_a', 'price_b'])
  expect(eligibleAgentPriceIds({ STRIPE_PRICE_ID: 'price_one' })).toEqual(['price_one'])
  expect(eligibleAgentPriceIds({})).toEqual([])
  for (const subscription_status of ['active', 'trialing']) {
    expect(hasAgentEntitlement({ subscription_status, price_id: 'price_agent' }, { STRIPE_PRICE_ID: 'price_agent' })).toBe(true)
  }
  for (const subscription_status of [null, 'past_due', 'unpaid', 'paused', 'incomplete', 'canceled']) {
    expect(hasAgentEntitlement({ subscription_status, price_id: 'price_agent' }, { STRIPE_PRICE_ID: 'price_agent' })).toBe(false)
  }
  expect(hasAgentEntitlement(null, { STRIPE_PRICE_ID: 'price_agent' })).toBe(false)
  expect(hasAgentEntitlement({ subscription_status: 'active', price_id: null }, { STRIPE_PRICE_ID: 'price_agent' })).toBe(false)
  expect(hasAgentEntitlement({ subscription_status: 'active', price_id: 'unknown' }, { STRIPE_PRICE_ID: 'price_agent' })).toBe(false)
})

it('fails closed for missing memberships, guests, and lookup errors', async () => {
  results = [{ data: null, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'u')).resolves.toEqual({ state: 'project_access_denied' })

  results = [{ data: { user_id: 'u', role: 'guest', is_owner: false }, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'u')).resolves.toEqual({ state: 'forbidden', role: 'guest' })

  results = [{ data: null, error: {} }]
  await expect(resolveWidgetAgentAccess('p', 'u')).rejects.toThrow('membership lookup')

  results = [{ data: { user_id: 'u', role: 'member', is_owner: false }, error: null }, { data: null, error: {} }]
  await expect(resolveWidgetAgentAccess('p', 'u')).rejects.toThrow('owner lookup')

  results = [{ data: { user_id: 'u', role: 'member', is_owner: false }, error: null }, { data: null, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'u')).resolves.toMatchObject({ state: 'project_access_denied', role: 'member' })
})

it('distinguishes owner upgrade, ask-owner, rollout seat denial, and ready owner', async () => {
  vi.mocked(getAccount).mockResolvedValue(null)
  results = [{ data: { user_id: 'owner', role: 'admin', is_owner: true }, error: null }, { data: { user_id: 'owner' }, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'owner')).resolves.toMatchObject({ state: 'upgrade_required', role: 'owner' })

  results = [{ data: { user_id: 'member', role: 'member', is_owner: false }, error: null }, { data: { user_id: 'owner' }, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'member')).resolves.toMatchObject({ state: 'owner_upgrade_required', ownerUserId: 'owner' })

  vi.mocked(getAccount).mockResolvedValue({ subscription_status: 'trialing', price_id: 'price_agent' } as never)
  results = [{ data: { user_id: 'member', role: 'member', is_owner: false }, error: null }, { data: { user_id: 'owner' }, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'member')).resolves.toMatchObject({ state: 'seat_limit_reached', collaboratorSeatLimit: AGENT_COLLABORATOR_SEAT_LIMIT })

  results = [{ data: { user_id: 'owner', role: 'admin', is_owner: true }, error: null }, { data: { user_id: 'owner' }, error: null }]
  await expect(resolveWidgetAgentAccess('p', 'owner')).resolves.toEqual({ state: 'ready', role: 'owner', ownerUserId: 'owner', collaboratorSeatLimit: 5 })
})
