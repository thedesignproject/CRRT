import { afterEach, expect, it, vi } from 'vitest'
import { domainAccessApi } from './domain-access-api'
afterEach(() => vi.unstubAllGlobals())
it('encodes paths, authenticates every call and sends only the required mutation inputs', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetch)
  const api = domainAccessApi('/api/', 'token')
  expect(await api.suggestions()).toEqual([])
  await api.domains('p/a')
  await api.addDomain('p/a', '@company.com')
  await api.removeDomain('p/a', 'company.com')
  await api.requests('p/a')
  await api.submit('p/a')
  await api.review('p/a', 'r/a', 'approved', 'member', 2)
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/v1/projects/suggestions', '/api/v1/projects/p%2Fa/email-domains', '/api/v1/projects/p%2Fa/email-domains',
    '/api/v1/projects/p%2Fa/email-domains?domain=company.com', '/api/v1/projects/p%2Fa/access-requests',
    '/api/v1/projects/p%2Fa/access-requests', '/api/v1/projects/p%2Fa/access-requests/r%2Fa',
  ])
  expect(fetch.mock.calls[2][1]).toMatchObject({ method: 'POST', body: '{"domain":"@company.com"}' })
  expect(fetch.mock.calls[3][1].method).toBe('DELETE')
  expect(fetch.mock.calls[6][1]).toMatchObject({ method: 'PATCH', body: '{"decision":"approved","role":"member","attempt":2}' })
  for (const [, init] of fetch.mock.calls) expect(init.headers.Authorization).toBe('Bearer token')
})
it('shows server errors and handles missing messages or malformed responses', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'No longer admin' }) })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('Invalid JSON') } })
  vi.stubGlobal('fetch', fetch)
  const api = domainAccessApi('/api', 't')
  await expect(api.suggestions()).rejects.toThrow('No longer admin')
  await expect(api.suggestions()).rejects.toThrow('Request failed (503)')
  await expect(api.suggestions()).rejects.toThrow('Invalid JSON')
})

it('explains lost admin permissions while preserving specific eligibility errors', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) })
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Domain removed' }) })
  vi.stubGlobal('fetch', fetch)
  const api = domainAccessApi('/api', 'token')
  await expect(api.addDomain('p', 'company.com')).rejects.toThrow('Project admin access is required. Your permissions may have changed.')
  await expect(api.submit('p')).rejects.toThrow('Domain removed')
})
