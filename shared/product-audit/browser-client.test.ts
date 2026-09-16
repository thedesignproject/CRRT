import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelAudit, createAudit, getAudit, getAuditCapabilities, getAuditEvents, readAuditCapability } from './browser-client'
const auditId = '11111111-1111-4111-8111-111111111111'
const now = '2026-08-25T00:00:00.000Z'
const run = { auditId, inputUrl: 'https://example.com/', mode: 'live', status: 'running', stage: 'explorer', progress: { auditId, stage: 'explorer', completedStages: [], observedEvidenceCount: 0, candidateCount: 0, admittedFindingCount: 0 }, coverage: { evaluatedSources: [], unavailableSources: ['repository', 'design-system', 'customer-rule'], routesAttempted: 0, routesEvaluated: 0 }, report: null, error: null, createdAt: now, startedAt: null, completedAt: null, cancelledAt: null, expiresAt: null }
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => {
  vi.unstubAllGlobals()
  const values = new Map<string, string>()
  const memoryStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => values.clear(),
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage })
  vi.stubGlobal('localStorage', memoryStorage)
})
describe('Product Audit browser client', () => {
  it('stores anonymous credentials locally and sends them only through headers', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ auditId, status: 'queued', sessionToken: 'session-secret', auditToken: 'audit-secret', expiresAt }, 202))
      .mockResolvedValueOnce(json(run))
    vi.stubGlobal('fetch', fetchMock)
    await createAudit('/api/', { url: 'https://example.com' })
    expect(readAuditCapability(auditId)).toBe('audit-secret')
    await getAudit('/api', auditId)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/audits')
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-Audit-Token')
    expect(fetchMock.mock.calls[1][0]).not.toContain('audit-secret')
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'X-Audit-Token': 'audit-secret' })
  })
  it('reuses the signed browser session on creation and uses bearer auth for projects', async () => {
    localStorage.setItem('crrt:audit:session', 'signed-session')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ auditId, status: 'queued' }, 202)))
    vi.stubGlobal('fetch', fetchMock)
    await createAudit('/api', { url: 'https://example.com' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'X-Audit-Session': 'signed-session' })
    await createAudit('/api', { url: 'https://example.com', projectKey: 'project', accessToken: 'bearer' })
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer bearer' })
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('X-Audit-Session')
  })
  it('cleans malformed and expired capabilities', () => {
    const otherId = '22222222-2222-4222-8222-222222222222'
    expect(readAuditCapability(otherId)).toBeUndefined()
    localStorage.setItem(`crrt:audit:capability:${otherId}`, 'bad json')
    expect(readAuditCapability(otherId)).toBeUndefined()
    localStorage.setItem(`crrt:audit:capability:${otherId}`, JSON.stringify({ token: 'old', expiresAt: '2020-01-01T00:00:00Z' }))
    expect(readAuditCapability(otherId)).toBeUndefined()
  })
  it('keeps anonymous credentials in page memory when storage throws', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('blocked') } })
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ auditId, status: 'queued', sessionToken: 'memory-session', auditToken: 'memory-token', expiresAt }, 202)).mockResolvedValueOnce(json({ auditId, status: 'queued' }, 202)).mockResolvedValueOnce(json(run))
    vi.stubGlobal('fetch', fetchMock)
    await createAudit('/api', { url: 'https://example.com' })
    await createAudit('/api', { url: 'https://example.org' })
    await getAudit('/api', auditId)
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'X-Audit-Session': 'memory-session' })
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ 'X-Audit-Token': 'memory-token' })
  })
  it('validates capabilities, events, cancellation, and server errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true }))
      .mockResolvedValueOnce(json({ events: [], nextCursor: '4' }))
      .mockResolvedValueOnce(json(run))
      .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAuditCapabilities('/api')).resolves.toMatchObject({ enabled: true })
    await expect(getAuditEvents('/api', auditId, '4', 'bearer')).resolves.toEqual({ events: [], nextCursor: '4' })
    await expect(cancelAudit('/api', auditId, 'bearer')).resolves.toMatchObject({ auditId })
    await expect(getAudit('/api', auditId, 'bearer')).rejects.toThrow('Unauthorized')
    await expect(getAudit('/api', auditId, 'bearer')).rejects.toThrow('Request failed with 500')
  })
})
