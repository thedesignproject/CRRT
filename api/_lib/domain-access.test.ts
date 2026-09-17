import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addEmailDomain, listEmailDomains, normalizeEmailDomain, removeEmailDomain, suggestDomainProjects } from './domain-access.js'
import { getServiceSupabase } from './supabase.js'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
const result = { data: [{ domain: 'company.com' }] as unknown, error: null as null | { message: string } }
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), upsert: vi.fn(), delete: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) }
const client = { from: vi.fn(() => query), rpc: vi.fn(async () => result) }
beforeEach(() => {
  vi.clearAllMocks()
  result.error = null
  result.data = [{ domain: 'company.com' }]
  for (const method of ['select', 'eq', 'order', 'upsert', 'delete'] as const) query[method].mockReturnValue(query)
  vi.mocked(getServiceSupabase).mockReturnValue(client as never)
})
describe('domain access store', () => {
  it('normalizes exact DNS domains and rejects email addresses, URLs, wildcards and invalid labels', () => {
    expect(normalizeEmailDomain(' @Company.COM ')).toBe('company.com')
    expect(normalizeEmailDomain('sub.company.com')).toBe('sub.company.com')
    for (const bad of [null, 1, '', 'localhost', '*.company.com', 'https://company.com', 'a@company.com', 'a..com', '-a.com', 'a-.com', `${'a'.repeat(64)}.com`, 'a.'.repeat(128) + 'com']) expect(normalizeEmailDomain(bad)).toBeNull()
  })
  it('scopes domain queries and delegates verified discovery to the RPC', async () => {
    expect(await suggestDomainProjects('user')).toBe(result.data)
    expect(client.rpc).toHaveBeenCalledWith('suggest_domain_projects', { p_user: 'user' })
    expect(await listEmailDomains('p')).toBe(result.data)
    expect(query.select).toHaveBeenCalledWith('domain')
    expect(query.eq).toHaveBeenCalledWith('project_key', 'p')
    result.data = 'updated'
    expect(await addEmailDomain('p', 'actor', 'company.com')).toBe('updated')
    expect(client.rpc).toHaveBeenCalledWith('mutate_project_email_domain', { p_project: 'p', p_actor: 'actor', p_domain: 'company.com', p_remove: false })
    result.data = 'forbidden'
    expect(await removeEmailDomain('p', 'actor', 'company.com')).toBe('forbidden')
    expect(client.rpc).toHaveBeenCalledWith('mutate_project_email_domain', { p_project: 'p', p_actor: 'actor', p_domain: 'company.com', p_remove: true })
  })
  it('fails closed on malformed mutation outcomes', async () => {
    for (const value of [null, {}, 'unknown']) {
      result.data = value
      await expect(addEmailDomain('p', 'actor', 'company.com')).rejects.toThrow('Invalid domain mutation result')
    }
  })
  it('propagates database errors for every operation', async () => {
    result.error = { message: 'unavailable' }
    for (const operation of [() => suggestDomainProjects('u'), () => listEmailDomains('p'), () => addEmailDomain('p', 'actor', 'd'), () => removeEmailDomain('p', 'actor', 'd')]) await expect(operation()).rejects.toThrow('unavailable')
  })
})
