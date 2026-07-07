import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
}))
vi.mock('../../../_lib/store.js', () => ({
  getProject: vi.fn(),
  getRepoConfig: vi.fn(),
  getShareById: vi.fn(),
  rotateShareToken: vi.fn(),
}))
vi.mock('../../../_lib/prompts.js', () => ({ buildPrompt: vi.fn(() => 'PROMPT_TEXT') }))
vi.mock('../../../_lib/tokens.js', () => ({
  decryptToken: vi.fn(() => 'tok'),
  encryptToken: vi.fn(() => 'ciphertext'),
  generateAccessToken: vi.fn(() => 'fresh-token'),
  hashToken: vi.fn(() => 'hashed'),
}))

import handler from './prompt.js'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { getProject, getRepoConfig, getShareById, rotateShareToken } from '../../../_lib/store.js'
import { buildPrompt } from '../../../_lib/prompts.js'
import { decryptToken } from '../../../_lib/tokens.js'

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
const SHARE = { id: 's', projectId: 'p', slug: 'sl', scopePageUrl: null, accessTokenCiphertext: 'c' }

beforeEach(() => {
  process.env.APP_URL = 'https://app.example'
  vi.mocked(requireUser).mockReset()
  vi.mocked(requireProjectMembership).mockReset()
  vi.mocked(getShareById).mockReset()
  vi.mocked(getProject).mockReset()
  vi.mocked(getRepoConfig).mockReset()
  vi.mocked(rotateShareToken).mockReset()
})

describe('api/v1/feedback-shares/[shareId]/prompt', () => {
  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates shareId / share lookup / membership / project lookup', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'GET', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getShareById).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(getShareById).mockResolvedValueOnce(SHARE as never)
    vi.mocked(requireProjectMembership).mockImplementationOnce(async (_q, r) => {
      r.status(403).json({ error: 'Forbidden' })
      return false
    })
    res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getShareById).mockResolvedValueOnce(SHARE as never)
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(true)
    vi.mocked(getProject).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns the prompt on success; 500 on store throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getShareById).mockResolvedValueOnce(SHARE as never)
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(true)
    vi.mocked(getProject).mockResolvedValueOnce({ publicKey: 'p', name: 'P' } as never)
    vi.mocked(getRepoConfig).mockResolvedValueOnce(null)

    let res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ prompt: 'PROMPT_TEXT' })

    vi.mocked(getShareById).mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Prompt could not be generated — please retry.' })
    expect(errorSpy).toHaveBeenCalledWith('[feedback-shares/prompt] prompt generation failed', expect.objectContaining({ shareId: 's' }))
    errorSpy.mockRestore()
  })

  it('self-heals a legacy share on decrypt failure: rotates and builds the prompt with the fresh token', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getShareById).mockResolvedValueOnce(SHARE as never)
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(true)
    vi.mocked(getProject).mockResolvedValueOnce({ publicKey: 'p', name: 'P' } as never)
    vi.mocked(getRepoConfig).mockResolvedValueOnce(null)
    vi.mocked(decryptToken).mockImplementationOnce(() => {
      throw new Error('Unsupported state or unable to authenticate data')
    })
    vi.mocked(rotateShareToken).mockResolvedValueOnce(SHARE as never)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ prompt: 'PROMPT_TEXT' })
    expect(rotateShareToken).toHaveBeenCalledWith('s', {
      accessTokenHash: 'hashed',
      accessTokenCiphertext: 'ciphertext',
    })
    expect(vi.mocked(buildPrompt)).toHaveBeenCalledWith('generic', expect.objectContaining({ token: 'fresh-token' }))
    expect(warnSpy).toHaveBeenCalledWith(
      '[feedback-shares/prompt] rotated undecryptable share token',
      { shareId: 's', projectKey: 'p' },
    )
    warnSpy.mockRestore()
  })

  it('returns a clean 410 when rotation itself fails', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getShareById).mockResolvedValueOnce(SHARE as never)
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(true)
    vi.mocked(getProject).mockResolvedValueOnce({ publicKey: 'p', name: 'P' } as never)
    vi.mocked(getRepoConfig).mockResolvedValueOnce(null)
    vi.mocked(decryptToken).mockImplementationOnce(() => {
      throw new Error('Unsupported state or unable to authenticate data')
    })
    vi.mocked(rotateShareToken).mockRejectedValueOnce(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = mockRes()
    await call({ method: 'GET', query: { shareId: 's' }, headers: {} }, res)

    expect(res.statusCode).toBe(410)
    expect(res.body).toEqual({ error: 'This share link could not be refreshed — please create a new share.' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
