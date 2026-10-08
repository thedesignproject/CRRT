import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: vi.fn() }))
vi.mock('../../../_lib/billing/service.js', () => ({ checkout: vi.fn() }))
vi.mock('../../../_lib/billing/config.js', () => ({ stripeEnabled: vi.fn() }))
vi.mock('../../../_lib/widget-session.js', async (original) => ({ ...await original<any>(), requireWidgetSession: vi.fn(), assertWidgetPage: vi.fn() }))
import { resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { checkout } from '../../../_lib/billing/service.js'
import { stripeEnabled } from '../../../_lib/billing/config.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import handler from './upgrade.js'

const body = { projectKey: 'p', pageUrl: 'https://example.com/page' }
const response = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() })
async function call(nextBody: unknown = body, method = 'POST') { const res = response(); await handler({ method, body: nextBody, headers: {} } as never, res as never); return res }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'owner', project_key: 'p', origin: 'https://example.com', display_name: 'Ada', expires_at: 'later' })
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state: 'upgrade_required', role: 'owner', ownerUserId: 'owner' })
  vi.mocked(stripeEnabled).mockReturnValue(true)
  vi.mocked(checkout).mockResolvedValue({ url: 'https://checkout.example/session' })
})

it('creates checkout only for the authenticated project owner', async () => {
  const res = await call()
  expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'owner' }), 'p', body.pageUrl)
  expect(checkout).toHaveBeenCalledWith({ userId: 'owner', email: '' })
  expect(res.status).toHaveBeenCalledWith(200)
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValueOnce({ state: 'owner_upgrade_required', ownerUserId: 'another' })
  expect((await call()).status).toHaveBeenCalledWith(403)
  expect(checkout).toHaveBeenCalledTimes(1)
})

it('validates request, billing availability, auth, and transient failures', async () => {
  expect((await call({}, 'OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call(body, 'GET')).status).toHaveBeenCalledWith(405)
  expect((await call({})).status).toHaveBeenCalledWith(400)
  vi.mocked(stripeEnabled).mockReturnValueOnce(false)
  expect((await call()).status).toHaveBeenCalledWith(404)
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401, 'expired'))
  expect((await call()).status).toHaveBeenCalledWith(401)
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(checkout).mockRejectedValueOnce(new Error('stripe down'))
  expect((await call()).status).toHaveBeenCalledWith(503)
  expect(spy).toHaveBeenCalled(); spy.mockRestore()
})
