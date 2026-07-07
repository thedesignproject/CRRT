import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/store.js', () => ({
  getProject: vi.fn(),
  getProjectShare: vi.fn(),
  createShare: vi.fn(),
  rotateShareToken: vi.fn(),
}))
vi.mock('../../_lib/tokens.js', () => ({
  decryptToken: vi.fn(() => 'stored-token'),
  encryptToken: vi.fn(() => 'ciphertext'),
  generateAccessToken: vi.fn(() => 'fresh-token'),
  generateSlug: vi.fn(() => 'slug'),
  hashToken: vi.fn(() => 'hashed'),
}))

import handler from './project.js'
import { createShare, getProject, getProjectShare, rotateShareToken } from '../../_lib/store.js'
import { decryptToken } from '../../_lib/tokens.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

const SHARE = {
  id: 'share-1',
  projectId: 'proj',
  slug: 'sl',
  scopePageUrl: null,
  accessTokenCiphertext: 'legacy-ciphertext',
}
const PROJECT = { publicKey: 'proj', name: 'Proj' }

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.APP_URL = 'https://app.example'
  vi.mocked(getProject).mockReset()
  vi.mocked(getProjectShare).mockReset()
  vi.mocked(createShare).mockReset()
  vi.mocked(rotateShareToken).mockReset()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('api/v1/public/project', () => {
  it('validates method and projectKey, 404s on unknown project', async () => {
    let res = mockRes()
    await call({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProject).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'proj' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns the stored token when the existing share decrypts', async () => {
    vi.mocked(getProject).mockResolvedValueOnce(PROJECT as never)
    vi.mocked(getProjectShare).mockResolvedValueOnce(SHARE as never)

    const res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'proj' }, headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ doc: { token: 'stored-token', slug: 'sl' } })
    expect(rotateShareToken).not.toHaveBeenCalled()
  })

  it('self-heals a legacy share on decrypt failure: rotates and returns a fresh token', async () => {
    vi.mocked(getProject).mockResolvedValueOnce(PROJECT as never)
    vi.mocked(getProjectShare).mockResolvedValueOnce(SHARE as never)
    vi.mocked(decryptToken).mockImplementationOnce(() => {
      throw new Error('Unsupported state or unable to authenticate data')
    })
    vi.mocked(rotateShareToken).mockResolvedValueOnce(SHARE as never)

    const res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'proj' }, headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ doc: { token: 'fresh-token', slug: 'sl' } })
    expect(rotateShareToken).toHaveBeenCalledWith('share-1', {
      accessTokenHash: 'hashed',
      accessTokenCiphertext: 'ciphertext',
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[public/project] rotated undecryptable share token',
      { shareId: 'share-1', projectKey: 'proj' },
    )
  })

  it('creates a fresh system share when none exists', async () => {
    vi.mocked(getProject).mockResolvedValueOnce(PROJECT as never)
    vi.mocked(getProjectShare).mockResolvedValueOnce(null)
    vi.mocked(createShare).mockResolvedValueOnce({ ...SHARE, slug: 'new-slug' } as never)

    const res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'proj' }, headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ doc: { token: 'fresh-token', slug: 'new-slug' } })
    expect(createShare).toHaveBeenCalledWith(expect.objectContaining({
      projectKey: 'proj',
      scopeType: 'project',
      accessTokenHash: 'hashed',
      accessTokenCiphertext: 'ciphertext',
      createdBy: 'system',
    }))
  })

  it('returns a friendly 500 without leaking the internal error', async () => {
    vi.mocked(getProject).mockRejectedValueOnce(new Error('Unsupported state or unable to authenticate data'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = mockRes()
    await call({ method: 'GET', query: { projectKey: 'proj' }, headers: {} }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Session could not be started — please retry.' })
    expect(errorSpy).toHaveBeenCalledWith('[public/project] session start failed', expect.objectContaining({ projectKey: 'proj' }))
  })
})
