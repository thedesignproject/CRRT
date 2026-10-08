import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ listWidgetAgentFeedback: vi.fn() }))
vi.mock('../../../_lib/widget-session.js', async (original) => ({
  ...await original<any>(), requireWidgetSession: vi.fn(), assertWidgetPage: vi.fn(),
}))
import { resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { listWidgetAgentFeedback } from '../../../_lib/store.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import handler from './eligibility.js'

function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() } }
async function call(method = 'GET', query: Record<string, unknown> = { projectKey: 'p', pageUrl: 'https://example.com/page' }) {
  const res = response(); await handler({ method, headers: {}, query } as never, res as never); return res
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'u', project_key: 'p', origin: 'https://example.com', display_name: 'Ada', expires_at: 'later' })
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state: 'ready', role: 'owner', collaboratorSeatLimit: 5 })
  vi.mocked(listWidgetAgentFeedback).mockResolvedValue([{ id: 'c', pageUrl: 'https://example.com/page', selector: 'body', body: 'Fix it', reviewStatus: 'open', implementationStatus: 'unassigned', claimedByAgentId: null, createdAt: 'now', authorName: null }] as never)
})

it('handles CORS preflight and unsupported methods without authentication', async () => {
  expect((await call('OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call('POST')).status).toHaveBeenCalledWith(405)
  expect(requireWidgetSession).not.toHaveBeenCalled()
})

it('authenticates project/page before returning safe access state', async () => {
  const res = await call()
  expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u' }), 'p', 'https://example.com/page')
  expect(resolveWidgetAgentAccess).toHaveBeenCalledWith('p', 'u')
  expect(res.status).toHaveBeenCalledWith(200)
  expect(listWidgetAgentFeedback).toHaveBeenCalledWith('p', 'u', 'https://example.com/page')
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready', role: 'owner', collaboratorSeatLimit: 5, comments: [expect.objectContaining({ id: 'c', body: 'Fix it' })] }))

  vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state: 'upgrade_required', role: 'owner' })
  expect((await call()).json).toHaveBeenCalledWith({ state: 'upgrade_required', role: 'owner', collaboratorSeatLimit: undefined, comments: undefined })
  expect(listWidgetAgentFeedback).toHaveBeenCalledTimes(1)
})

it('fails closed for missing scope, widget auth errors, origin errors, and unexpected failures', async () => {
  expect((await call('GET', {})).status).toHaveBeenCalledWith(403)
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401, 'expired'))
  expect((await call()).status).toHaveBeenCalledWith(401)
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(403, 'origin'))
  expect((await call()).status).toHaveBeenCalledWith(403)
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new Error('database'))
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect((await call()).status).toHaveBeenCalledWith(500)
  expect(spy).toHaveBeenCalled(); spy.mockRestore()
})
