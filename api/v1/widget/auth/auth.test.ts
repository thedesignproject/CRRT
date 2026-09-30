import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../_lib/widget-session.js', async (original) => ({ ...await original<any>(), createWidgetHandoff: vi.fn(), exchangeWidgetHandoff: vi.fn(), revokeWidgetSession: vi.fn() }))
import { requireUser } from '../../../_lib/auth.js'
import { createWidgetHandoff, exchangeWidgetHandoff, revokeWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import handoff from './handoff.js'
import exchange from './exchange.js'
function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() } }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' }) })
it.each([handoff, exchange])('supports preflight and rejects unsupported methods', async (handler) => {
  for (const [method, status] of [['OPTIONS', 204], ['GET', 405]] as const) {
    const response = res(); await handler({ method, headers: {}, query: {} } as never, response as never); expect(response.status).toHaveBeenCalledWith(status)
  }
})
it('requires a dashboard session for handoff creation', async () => {
  vi.mocked(requireUser).mockResolvedValue(null)
  await handoff({ method: 'POST', headers: {} } as never, res() as never)
  expect(createWidgetHandoff).not.toHaveBeenCalled()
})
it('returns a handoff and passes request fields to the service', async () => {
  vi.mocked(createWidgetHandoff).mockResolvedValue({ code: 'code', state: 'state' })
  for (const body of [undefined, { projectKey: 'p' }]) {
    const response = res(); await handoff({ method: 'POST', headers: {}, body } as never, response as never)
    expect(response.status).toHaveBeenCalledWith(201); expect(response.json).toHaveBeenCalledWith({ code: 'code', state: 'state' })
  }
})
it('exchanges codes and revokes sessions', async () => {
  vi.mocked(exchangeWidgetHandoff).mockResolvedValue({ accessToken: 'limited', displayName: 'a', expiresAt: 'date' })
  for (const body of [undefined, { code: 'code' }]) {
    const response = res(); await exchange({ method: 'POST', headers: { origin: 'https://site.test' }, body } as never, response as never)
    expect(response.status).toHaveBeenCalledWith(200)
  }
  const response = res(); await exchange({ method: 'DELETE', headers: {} } as never, response as never)
  expect(revokeWidgetSession).toHaveBeenCalledOnce(); expect(response.status).toHaveBeenCalledWith(204)
})
it.each([new WidgetSessionError(403, 'Forbidden'), new Error('secret')])('returns safe errors', async (error) => {
  vi.mocked(createWidgetHandoff).mockRejectedValue(error); vi.mocked(exchangeWidgetHandoff).mockRejectedValue(error)
  for (const handler of [handoff, exchange]) {
    const response = res(); await handler({ method: 'POST', headers: {} } as never, response as never)
    expect(response.status).toHaveBeenCalledWith(error instanceof WidgetSessionError ? 403 : 500)
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret')
  }
})
