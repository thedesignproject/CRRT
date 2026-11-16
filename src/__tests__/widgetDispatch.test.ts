import { expect, it, vi } from 'vitest'
import { fetchDelivery, sendFeedback } from '../components/FeedbackWidget/dispatch'
import { widgetRequest } from '../lib/widgetLogin'
vi.mock('../lib/widgetLogin', () => ({ widgetRequest: vi.fn() }))
const session = { accessToken: 't', displayName: 'T', expiresAt: '2099' }
it('uses authenticated transport and validates the delivery envelope', async () => {
 vi.mocked(widgetRequest).mockResolvedValue(new Response(JSON.stringify({ listeners: [], dispatches: [] })))
 expect(await fetchDelivery('/api', 'project', 'https://example.com', session)).toEqual({ listeners: [], dispatches: [] })
 for (const body of [{}, { listeners: [] }]) {
  vi.mocked(widgetRequest).mockResolvedValue(new Response(JSON.stringify(body)))
  await expect(fetchDelivery('/api', 'project', 'page', session)).rejects.toThrow('Invalid delivery state')
 }
 const input = { projectKey: 'p', pageUrl: 'url', listenerId: 'l', commentId: 'c', expectedUpdatedAt: 'now', idempotencyKey: 'key' }
 vi.mocked(widgetRequest).mockResolvedValue(new Response(JSON.stringify({ dispatchId: 'd', state: 'queued' })))
 expect(await sendFeedback('/api', session, input)).toEqual({ dispatchId: 'd', state: 'queued' })
 expect(widgetRequest).toHaveBeenLastCalledWith('/api', '/v1/widget/agent/dispatch', session, { method: 'POST', body: JSON.stringify(input) })
})
