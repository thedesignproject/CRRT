import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../../_lib/shares.js', () => ({ requireAgentShare: vi.fn() }))
vi.mock('../../../../_lib/store.js', () => ({ getProject: vi.fn(), getRepoConfig: vi.fn(), listCommentsForShare: vi.fn(), getLatestShareRevision: vi.fn(), listLivePresence: vi.fn() }))
import { requireAgentShare } from '../../../../_lib/shares.js'
import { getProject, getRepoConfig, listCommentsForShare, getLatestShareRevision, listLivePresence } from '../../../../_lib/store.js'
import handler from './state.js'
beforeEach(() => {
  vi.mocked(requireAgentShare).mockResolvedValue({ share: { id:'s', projectId:'p' } } as never)
  vi.mocked(getProject).mockResolvedValue({ publicKey:'p', name:'P' } as never)
  vi.mocked(getRepoConfig).mockResolvedValue(null)
  vi.mocked(getLatestShareRevision).mockResolvedValue(1)
  vi.mocked(listLivePresence).mockResolvedValue([])
  vi.mocked(listCommentsForShare).mockResolvedValue([])
})
it.each([null, new Error('share_unavailable'), new Error('database unavailable')])('maps a concurrent share rejection safely: %j', async error => {
  if (error) vi.mocked(listCommentsForShare).mockRejectedValueOnce(error)
  const res = { statusCode:200, body:null as unknown, status(n:number){this.statusCode=n;return this}, json(b:unknown){this.body=b;return this},setHeader:vi.fn() }
  await handler({ method:'GET',query:{slug:'s'},headers:{} } as never,res as never)
  expect(res.statusCode).toBe(error ? error.message === 'share_unavailable' ? 410 : 500 : 200)
  if (error) expect(res.body).not.toHaveProperty('comments')
})
