import { afterEach, expect, it, vi } from 'vitest'
const retry = vi.hoisted(() => vi.fn())
vi.mock('./processing.js', () => ({ retryProcessing: retry }))
vi.mock('../auth.js', () => ({ requireUser: async () => ({ userId: 'owner' }) }))
import handler from '../../v1/recordings/[id]/retry'
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
it('routes stage retries through owner authentication and validation', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  const id = 'c59a8d3a-7b1f-45ed-947c-de7bb54a4f03'
  const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: 'POST', query: { id }, body: { stage: 'metadata' }, headers: {} } as any, res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(retry).toHaveBeenCalledWith('owner', id, { stage: 'metadata' })
})
