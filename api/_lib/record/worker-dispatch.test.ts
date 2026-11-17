import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('./core.js', () => ({
  database: vi.fn(),
  rpc: vi.fn(),
  allPages: async (query: (from: number, to: number) => Promise<{ data: unknown; error?: unknown }>) => {
    const result = await query(0, 499)
    if (!result.data) throw new Error('record_worker_queue_unavailable')
    return result.data
  },
  checked: (result: { data: unknown; error?: unknown }) => {
    if (result.error) throw new Error('database-failed')
    return result.data
  },
}))
import { start } from 'workflow/api'
import { database, rpc } from './core.js'
import { dispatchRecordWorker } from './worker-dispatch.js'

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  in: vi.fn(),
  lte: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  limit: vi.fn(),
}
const waiting = (
  stage = 'metadata',
  owner: string | null = 'owner',
  deleted: string | null = null,
  dependencies: { stage: string; state: string }[] = [],
) => ({ stage, recordings: { owner_id: owner, deleted_at: deleted, recording_jobs: dependencies } })
beforeEach(() => {
  vi.resetAllMocks()
  for (const key of ['select', 'eq', 'gt', 'in', 'lte', 'order'] as const) query[key].mockReturnValue(query)
  query.limit.mockResolvedValue({ data: [] })
  query.range.mockResolvedValue({ data: [] })
  vi.mocked(database).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as never)
})
it('sweeps and dispatches waiting jobs through the registered workflow', async () => {
  query.range.mockResolvedValueOnce({ data: [waiting()] })
  expect(await dispatchRecordWorker()).toBe(true)
  expect(rpc).toHaveBeenCalledWith('record_sweep', {})
  expect(start).toHaveBeenCalledWith({ workflowId: 'workflow//./workflows/record-worker//recordWorkerWorkflow' }, [])
  expect(query.in).toHaveBeenCalledWith('state', ['pending', 'running'])
  expect(query.lte).toHaveBeenCalledWith('available_at', expect.any(String))
})
it('leaves active job leases alone', async () => {
  query.limit.mockResolvedValueOnce({ data: [{ recording_id: 'busy' }] })
  expect(await dispatchRecordWorker()).toBe(false)
  expect(query.limit).toHaveBeenCalledTimes(1)
  expect(start).not.toHaveBeenCalled()
})
it('creates no workflow or VM for an empty queue', async () => {
  expect(await dispatchRecordWorker()).toBe(false)
  expect(start).not.toHaveBeenCalled()
})
it('propagates queue failures instead of starting work blindly', async () => {
  query.limit.mockResolvedValueOnce({ error: {} })
  await expect(dispatchRecordWorker()).rejects.toThrow('database-failed')
  expect(start).not.toHaveBeenCalled()
})
it.each([0, 1])('rejects missing queue data on query %s', async (index) => {
  if (index) query.range.mockResolvedValueOnce({ data: null })
  else query.limit.mockResolvedValueOnce({ data: null })
  await expect(dispatchRecordWorker()).rejects.toThrow('record_worker_queue_unavailable')
  expect(start).not.toHaveBeenCalled()
})
it.each([
  waiting('metadata', null),
  waiting('metadata', 'owner', 'deleted'),
  waiting('alignment', 'owner', null, [{ stage: 'metadata', state: 'failed' }]),
  waiting('alignment', 'owner', null, [{ stage: 'transcription', state: 'pending' }]),
])('does not launch for an unclaimable job %#', async (job) => {
  query.range.mockResolvedValueOnce({ data: [job] })
  expect(await dispatchRecordWorker()).toBe(false)
  expect(start).not.toHaveBeenCalled()
})
it.each([
  waiting('cleanup', null, 'deleted'),
  waiting('alignment', 'owner', null, [
    { stage: 'metadata', state: 'done' },
    { stage: 'transcription', state: 'done' },
    { stage: 'cleanup', state: 'pending' },
  ]),
])('dispatches eligible cleanup and alignment jobs %#', async (job) => {
  query.range.mockResolvedValueOnce({ data: [job] })
  expect(await dispatchRecordWorker()).toBe(true)
})
