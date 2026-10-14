import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getServiceSupabase } from './supabase.js'
import { processExtensionImageCleanup } from './extension-image-cleanup.js'

function setup(responses: unknown[], remove = vi.fn().mockResolvedValue({ error: null })) {
  const queries: any[] = []
  const from = vi.fn(() => {
    const result = responses.shift()
    const q: any = { then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) }
    for (const method of ['select', 'in', 'lte', 'order', 'limit', 'delete', 'eq', 'update']) q[method] = vi.fn(() => q)
    queries.push(q)
    return q
  })
  vi.mocked(getServiceSupabase).mockReturnValue({ from, storage: { from: () => ({ remove }) } } as never)
  return { queries, from, remove }
}
beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
it('removes only persisted deleted paths and acknowledges after storage success', async () => {
  const fake = setup([{ data: [{ storage_path: 'u/a.png', attempts: 0 }] }, {}])
  await processExtensionImageCleanup(['u/a.png'])
  expect(fake.queries[0].in).toHaveBeenCalledWith('storage_path', ['u/a.png'])
  expect(fake.remove).toHaveBeenCalledExactlyOnceWith(['u/a.png'])
  expect(fake.queries[1].delete).toHaveBeenCalledOnce()
  expect(fake.queries[1].eq.mock.calls).toEqual([['storage_path', 'u/a.png'], ['attempts', 0]])
})
it('cron reads at most 100 due jobs, and handles null/empty queues', async () => {
  const fake = setup([{ data: null }])
  await processExtensionImageCleanup()
  expect(fake.queries[0].lte).toHaveBeenCalledWith('next_attempt_at', expect.any(String))
  expect(fake.queries[0].order).toHaveBeenCalledWith('next_attempt_at')
  expect(fake.queries[0].limit).toHaveBeenCalledWith(100)
  expect(fake.remove).not.toHaveBeenCalled()
})
it.each(['storage', 'network', 'ack'])('keeps a durable retry after %s failure', async (failure) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T00:00:00Z'))
  const remove = vi.fn()
  if (failure === 'network') remove.mockRejectedValueOnce(new Error('network'))
  else remove.mockResolvedValueOnce({ error: failure === 'storage' ? { message: 'storage' } : null })
  const responses: unknown[] = [{ data: [{ storage_path: 'u/a.png', attempts: 8 }] }]
  if (failure === 'ack') responses.push({ error: { message: 'db' } })
  responses.push({})
  const fake = setup(responses, remove)
  await processExtensionImageCleanup()
  expect(fake.queries[fake.queries.length - 1].update).toHaveBeenCalledWith({ attempts: 9, next_attempt_at: '2026-10-14T01:00:00.000Z' })
  expect(fake.queries[fake.queries.length - 1].eq).toHaveBeenCalledWith('attempts', 8)
  vi.useRealTimers()
})
it('reports queue read and retry persistence failures while retaining the job', async () => {
  setup([{ error: { message: 'read down' } }])
  await expect(processExtensionImageCleanup()).rejects.toThrow('read down')
  const fake = setup([{ data: [{ storage_path: 'a', attempts: 0 }] }, { error: { message: 'retry down' } }], vi.fn().mockResolvedValue({ error: { message: 'storage down' } }))
  await expect(processExtensionImageCleanup()).rejects.toThrow('retry down')
  expect(fake.queries[1].delete).not.toHaveBeenCalled()
})
