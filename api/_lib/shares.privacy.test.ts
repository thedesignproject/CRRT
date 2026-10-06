import { expect, it, vi } from 'vitest'
vi.mock('./store.js', () => ({ getProject: vi.fn(), getShareBySlug: vi.fn() }))
vi.mock('./tokens.js', () => ({ hashToken: vi.fn(() => 'hash') }))
import { getProject, getShareBySlug } from './store.js'
import { requireAgentShare } from './shares.js'
it('rejects a previously issued automatic public share after the project becomes private', async () => {
  const share = { createdBy: 'system', projectId: 'p', expiresAt: '2099-01-01', accessTokenHash: 'hash' }
  vi.mocked(getShareBySlug).mockResolvedValue(share as never)
  vi.mocked(getProject).mockResolvedValue({ widgetPrivate: true } as never)
  const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
  const req: any = { headers: { authorization: 'Bearer token' }, query: {} }
  expect(await requireAgentShare(req, res, 'slug')).toBeNull()
  expect(res.status).toHaveBeenCalledWith(410)
  vi.mocked(getProject).mockResolvedValue(null)
  expect(await requireAgentShare(req, res, 'slug')).toEqual({ share, token: 'token' })
})
