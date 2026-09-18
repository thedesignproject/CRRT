import { beforeEach, expect, it, vi } from 'vitest'
import suggestions from './suggestions.js'
import domains from './[projectId]/email-domains.js'
import { requireUser, requireProjectCapability } from '../../_lib/auth.js'
import { addEmailDomain, listEmailDomains, removeEmailDomain, suggestDomainProjects } from '../../_lib/domain-access.js'
vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn(), requireProjectCapability: vi.fn() }))
vi.mock('../../_lib/domain-access.js', async importOriginal => ({ ...await importOriginal<object>(), addEmailDomain: vi.fn(), listEmailDomains: vi.fn(), removeEmailDomain: vi.fn(), suggestDomainProjects: vi.fn() }))
async function call(handler: typeof suggestions, method = 'GET', query: object = { projectId: 'p' }, body?: unknown) {
  const res = { statusCode: 200, body: undefined as unknown, status(n: number) { this.statusCode = n; return this }, json(data: unknown) { this.body = data; return this }, end() {}, setHeader() {} }
  await handler({ method, query, body, headers: {} } as never, res as never)
  return res
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@company.com' })
  vi.mocked(requireProjectCapability).mockResolvedValue({ role: 'admin' })
  vi.mocked(listEmailDomains).mockResolvedValue([{ domain: 'company.com' }])
  vi.mocked(suggestDomainProjects).mockResolvedValue([])
  vi.mocked(addEmailDomain).mockResolvedValue('updated')
  vi.mocked(removeEmailDomain).mockResolvedValue('updated')
})
it('handles transport, authentication, and project authorization before reading data', async () => {
  for (const handler of [suggestions, domains]) {
    expect((await call(handler, 'OPTIONS')).statusCode).toBe(204)
    expect((await call(handler, 'PUT')).statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValueOnce(null)
    await call(handler)
  }
  expect(suggestDomainProjects).not.toHaveBeenCalled()
  expect(listEmailDomains).not.toHaveBeenCalled()
  expect((await call(domains, 'GET', {})).statusCode).toBe(400)
  vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
  await call(domains)
  expect(listEmailDomains).not.toHaveBeenCalled()
})
it('only discovers projects for the authenticated identity', async () => {
  expect((await call(suggestions, 'GET', { userId: 'attacker' })).body).toEqual([])
  expect(suggestDomainProjects).toHaveBeenCalledWith('u')
  vi.mocked(suggestDomainProjects).mockRejectedValueOnce(new Error('failed'))
  expect((await call(suggestions)).statusCode).toBe(500)
})
it('lists, adds and removes normalized domains with admin permissions', async () => {
  expect((await call(domains)).body).toEqual([{ domain: 'company.com' }])
  expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'p', 'project:manage')
  expect((await call(domains, 'POST', { projectId: 'p' }, { domain: ' @Company.COM ' })).statusCode).toBe(200)
  expect(addEmailDomain).toHaveBeenCalledWith('p', 'u', 'company.com')
  expect((await call(domains, 'DELETE', { projectId: 'p', domain: 'company.com' })).statusCode).toBe(200)
  expect(removeEmailDomain).toHaveBeenCalledWith('p', 'u', 'company.com')
  for (const body of [undefined, {}, { domain: '*' }]) expect((await call(domains, 'POST', { projectId: 'p' }, body)).statusCode).toBe(400)
  expect((await call(domains, 'DELETE')).statusCode).toBe(400)
  vi.mocked(listEmailDomains).mockRejectedValueOnce(new Error('failed'))
  expect((await call(domains)).statusCode).toBe(500)
})

it('rejects domain changes if permissions were revoked after the initial check', async () => {
  for (const method of ['POST', 'DELETE']) {
    vi.mocked(addEmailDomain).mockResolvedValueOnce('forbidden')
    vi.mocked(removeEmailDomain).mockResolvedValueOnce('forbidden')
    expect((await call(domains, method, { projectId: 'p', domain: 'company.com' }, { domain: 'company.com', actor: 'spoof' })).statusCode).toBe(403)
  }
  expect(listEmailDomains).not.toHaveBeenCalled()
})
