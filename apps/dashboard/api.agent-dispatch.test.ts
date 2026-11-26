import { afterEach, expect, it, vi } from 'vitest'
import { getAgentDelivery, sendAgentDispatch } from './api'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

it('reads listeners and dispatches, then sends one comment to a terminal', async () => {
  const delivery = { listeners: [{ listenerId: 'l1', label: 'crrt', repoUrl: '', online: true }], dispatches: [] }
  const fetch = vi.fn()
    .mockResolvedValueOnce(json(delivery))
    .mockResolvedValueOnce(json({ dispatchId: 'd1', state: 'queued' }, 201))
  vi.stubGlobal('fetch', fetch)

  await expect(getAgentDelivery('/api/', 'token', 'pk/1')).resolves.toEqual(delivery)
  const input = { listenerId: 'l1', commentId: 'c1', expectedUpdatedAt: 't1', idempotencyKey: 'k1' }
  await expect(sendAgentDispatch('/api', 'token', 'pk/1', input)).resolves.toEqual({ dispatchId: 'd1', state: 'queued' })

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/projects/pk%2F1/agent/dispatch', expect.objectContaining({ cache: 'no-store' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/projects/pk%2F1/agent/dispatch', expect.objectContaining({
    method: 'POST', body: JSON.stringify(input),
  }))
})

it('keeps the API error code on a failed send', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'Offline', code: 'listener_offline' }, 409)))
  await expect(sendAgentDispatch('/api', 'token', 'pk', { listenerId: 'l', commentId: 'c', expectedUpdatedAt: 't', idempotencyKey: 'k' }))
    .rejects.toMatchObject({ status: 409, code: 'listener_offline' })
})
