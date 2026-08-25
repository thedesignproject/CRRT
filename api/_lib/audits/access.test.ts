import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth.js', () => ({ requireProjectMembership: vi.fn(), requireUser: vi.fn() }))
vi.mock('./store.js', () => ({ getAuditAccessRow: vi.fn() }))
vi.mock('./tokens.js', () => ({ hashAuditCapability: vi.fn() }))

import { requireProjectMembership, requireUser } from '../auth.js'
import { requireAuditAccess } from './access.js'
import { getAuditAccessRow } from './store.js'
import { hashAuditCapability } from './tokens.js'

function response() {
  return { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this }, json(value: unknown) { this.body = value; return this }, setHeader() { return this } }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.AUDIT_LOCAL_ACCESS_BYPASS
  vi.mocked(requireUser).mockResolvedValue({ userId: 'user', email: 'u@example.com' })
  vi.mocked(requireProjectMembership).mockResolvedValue(true)
  vi.mocked(hashAuditCapability).mockReturnValue('hash')
})

afterEach(() => { delete process.env.AUDIT_LOCAL_ACCESS_BYPASS })

describe('audit capability access', () => {
  it('returns 404 for unknown runs', async () => {
    vi.mocked(getAuditAccessRow).mockResolvedValue(null)
    const res = response()
    await expect(requireAuditAccess({ headers: {} } as never, res as never, 'id')).resolves.toBeNull()
    expect(res.statusCode).toBe(404)
  })

  it('requires strict bearer auth and project membership for project runs', async () => {
    const row = { owner_kind: 'project', project_key: 'project' }
    vi.mocked(getAuditAccessRow).mockResolvedValue(row)
    let res = response()
    expect(await requireAuditAccess({ headers: {} } as never, res as never, 'id')).toBeNull()
    expect(res.statusCode).toBe(401)
    vi.mocked(requireUser).mockResolvedValueOnce(null)
    res = response()
    expect(await requireAuditAccess({ headers: { authorization: 'Bearer token' } } as never, res as never, 'id')).toBeNull()
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(false)
    res = response()
    expect(await requireAuditAccess({ headers: { authorization: 'Bearer token' } } as never, res as never, 'id')).toBeNull()
    res = response()
    await expect(requireAuditAccess({ headers: { authorization: 'Bearer token' } } as never, res as never, 'id')).resolves.toEqual(row)
  })

  it('requires an unexpired anonymous capability header', async () => {
    vi.mocked(getAuditAccessRow).mockResolvedValue({ owner_kind: 'anonymous', expires_at: new Date(Date.now() - 1).toISOString(), capability_token_hash: 'hash' })
    let res = response()
    expect(await requireAuditAccess({ headers: {} } as never, res as never, 'id')).toBeNull()
    expect(res.statusCode).toBe(410)
    vi.mocked(getAuditAccessRow).mockResolvedValue({ owner_kind: 'anonymous', expires_at: new Date(Date.now() + 10_000).toISOString(), capability_token_hash: 'hash' })
    vi.mocked(hashAuditCapability).mockReturnValueOnce('wrong')
    res = response()
    expect(await requireAuditAccess({ headers: { 'x-audit-token': ['bad'] } } as never, res as never, 'id')).toBeNull()
    expect(res.statusCode).toBe(401)
    res = response()
    await expect(requireAuditAccess({ headers: { 'x-audit-token': 'good' } } as never, res as never, 'id')).resolves.toMatchObject({ owner_kind: 'anonymous' })
  })

  it('allows unexpired anonymous reads only in explicitly enabled local development', async () => {
    const row = { owner_kind: 'anonymous', expires_at: new Date(Date.now() + 10_000).toISOString(), capability_token_hash: 'hash' }
    vi.mocked(getAuditAccessRow).mockResolvedValue(row)
    process.env.AUDIT_LOCAL_ACCESS_BYPASS = 'true'
    await expect(requireAuditAccess({ headers: {} } as never, response() as never, 'id')).resolves.toEqual(row)
    expect(hashAuditCapability).not.toHaveBeenCalled()
  })
})
