import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/billing/agent-entitlement.js', () => ({ eligibleAgentPriceIds: vi.fn(), resolveWidgetAgentAccess: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ createWidgetAgentShare: vi.fn() }))
vi.mock('../../../_lib/tokens.js', () => ({
  generateAccessToken: vi.fn(() => 'generated-token'), generateSlug: vi.fn(() => 'slug'),
  hashToken: vi.fn(() => 'generated-hash'), encryptToken: vi.fn(() => 'generated-cipher'),
  decryptToken: vi.fn(() => 'original-token'),
}))
vi.mock('../../../_lib/widget-session.js', async (original) => ({
  ...await original<any>(), requireWidgetSession: vi.fn(), assertWidgetPage: vi.fn(),
}))
import { eligibleAgentPriceIds, resolveWidgetAgentAccess } from '../../../_lib/billing/agent-entitlement.js'
import { createWidgetAgentShare } from '../../../_lib/store.js'
import { decryptToken } from '../../../_lib/tokens.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../../_lib/widget-session.js'
import handler from './session.js'

const id = '11111111-1111-4111-8111-111111111111'
const body = { projectKey: 'p', pageUrl: 'https://example.com/page', idempotencyKey: 'abcdefghijklmnop', commentIds: [id] }
const share = { id: 'share', slug: 'slug', accessTokenHash: 'generated-hash', accessTokenCiphertext: 'generated-cipher', expiresAt: '2099-01-01' }
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() } }
async function call(method = 'POST', nextBody: unknown = body, headers: Record<string, unknown> = {}) {
  const res = response(); await handler({ method, body: nextBody, headers, query: {} } as never, res as never); return res
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'u', project_key: 'p', origin: 'https://example.com', display_name: 'Ada', expires_at: 'later' })
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state: 'ready', role: 'owner' })
  vi.mocked(eligibleAgentPriceIds).mockReturnValue(['price_agent'])
  vi.mocked(createWidgetAgentShare).mockResolvedValue(share as never)
})

it('handles preflight and rejects unsupported methods without authenticating', async () => {
  expect((await call('OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call('GET')).status).toHaveBeenCalledWith(405)
  expect(requireWidgetSession).not.toHaveBeenCalled()
})

it('creates an exact owner session with every server-authoritative input', async () => {
  const res = await call()
  expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u' }), 'p', body.pageUrl)
  expect(createWidgetAgentShare).toHaveBeenCalledWith(expect.objectContaining({
    projectKey: 'p', actorUserId: 'u', pageUrl: body.pageUrl, idempotencyKey: body.idempotencyKey,
    allowedPriceIds: ['price_agent'], commentIds: [id], accessTokenHash: 'generated-hash',
    requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  }))
  expect(res.status).toHaveBeenCalledWith(201)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ shareId: 'share', token: 'generated-token', commentCount: 1 }))
  expect(decryptToken).not.toHaveBeenCalled()
})

it('returns the original token and 200 for an idempotent retry', async () => {
  vi.mocked(createWidgetAgentShare).mockResolvedValue({ ...share, accessTokenHash: 'original-hash', accessTokenCiphertext: 'original-cipher' } as never)
  const res = await call()
  expect(decryptToken).toHaveBeenCalledWith('original-cipher')
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'original-token' }))
})

it('fails closed before share creation for malformed input, access denials, and missing catalog', async () => {
  expect((await call('POST', {})).status).toHaveBeenCalledWith(409)
  for (const state of ['project_access_denied', 'forbidden', 'upgrade_required', 'owner_upgrade_required', 'seat_limit_reached'] as const) {
    vi.mocked(resolveWidgetAgentAccess).mockResolvedValueOnce({ state })
    expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ code: state }))
  }
  vi.mocked(eligibleAgentPriceIds).mockReturnValueOnce([])
  expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ code: 'upgrade_required' }))
  expect(createWidgetAgentShare).not.toHaveBeenCalled()
})

it.each([
  ['idempotency_conflict', 'idempotency_conflict'], ['invalid_selection', 'invalid_selection'],
  ['share_comments_changed', 'invalid_selection'], ['seat_limit_reached', 'seat_limit_reached'],
  ['upgrade_required', 'upgrade_required'], ['forbidden', 'project_access_denied'],
] as const)('maps database %s without leaking details', async (message, code) => {
  vi.mocked(createWidgetAgentShare).mockRejectedValueOnce(new Error(message))
  expect((await call()).json).toHaveBeenCalledWith(expect.objectContaining({ code }))
})

it('maps widget-session failures and unexpected errors safely', async () => {
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401, 'expired'))
  expect((await call()).status).toHaveBeenCalledWith(401)
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(403, 'origin'))
  expect((await call()).status).toHaveBeenCalledWith(403)
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(createWidgetAgentShare).mockRejectedValueOnce(new Error('database down'))
  expect((await call()).status).toHaveBeenCalledWith(500)
  vi.mocked(createWidgetAgentShare).mockRejectedValueOnce('bad')
  expect((await call()).status).toHaveBeenCalledWith(500)
  expect(spy).toHaveBeenCalledWith('[widget-agent/session] creation failed', expect.objectContaining({ projectKey: 'p' }))
  spy.mockRestore()
})
