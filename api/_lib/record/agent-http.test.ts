import { afterEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ agentPayload: vi.fn(), recordCapabilities: vi.fn(), retryProcessing: vi.fn() }))
vi.mock('./agent.js', () => ({ agentPayload: m.agentPayload, recordCapabilities: m.recordCapabilities }))
vi.mock('./processing.js', () => ({ retryProcessing: m.retryProcessing }))
vi.mock('../auth.js', () => ({ requireUser: async () => ({ userId: 'owner' }) }))
import agent from '../../v1/recordings/[id]/agent-payload'
import capabilities from '../../v1/recordings/capabilities'
import retry from '../../v1/recordings/[id]/retry'
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
it('uses authenticated owner boundaries for capabilities, paid payload and stage retry', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  const id = '39fe3a78-2b42-443a-aade-d545d20f1c52'
  for (const [handler, method] of [[agent, 'POST'], [capabilities, 'GET'], [retry, 'POST']] as const) {
    const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res)
    await handler({ method, query: { id }, body: {}, headers: {} } as any, res)
    expect(res.status).toHaveBeenCalledWith(200)
  }
  expect(m.agentPayload).toHaveBeenCalled(); expect(m.recordCapabilities).toHaveBeenCalled(); expect(m.retryProcessing).toHaveBeenCalled()
})
