import { afterEach, expect, it, vi } from 'vitest'
import { recordRequest, recordingShareUrl } from './client'
afterEach(() => vi.unstubAllGlobals())
it('uses bearer auth only for owner requests and puts share capabilities in fragments', async () => {
  const request = vi.fn().mockImplementation(async () => Response.json({ ok: true }))
  vi.stubGlobal('fetch', request)
  expect(await recordRequest('https://api.test/api/', 'recordings', 'token', { title: 'Test' })).toEqual({ ok: true })
  expect(request).toHaveBeenCalledWith('https://api.test/api/v1/recordings', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, credentials: 'omit' }))
  await recordRequest('https://api.test/api', 'recording-shares/token', null)
  expect(request.mock.lastCall![1]).toMatchObject({ method: 'GET', headers: {} })
  await recordRequest('https://api.test/api', 'recordings/id', 'token', undefined, 'DELETE')
  expect(request.mock.lastCall![1].method).toBe('DELETE')
  expect(recordingShareUrl('https://app.test/dashboard/', 'capability')).toBe('https://app.test/dashboard/recording#capability')
})
it.each([[401, {}, 'Sign in'], [402, { error: { code: 'record_upgrade_required' } }, 'paid plan'], [503, {}, '503']])('reports status %s', async (status, payload, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload, { status })))
  await expect(recordRequest('/api', 'recordings', null)).rejects.toThrow(message as string)
})
it('handles non-JSON failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })))
  await expect(recordRequest('/api', 'recordings', null)).rejects.toThrow('503')
})
