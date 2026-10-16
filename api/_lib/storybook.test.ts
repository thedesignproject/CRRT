import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashProof } from './extension-auth-contracts.js'
vi.mock('./auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('./store.js', async (original) => ({ ...await original<any>(), getComment: vi.fn(), getProject: vi.fn(), getProjectMember: vi.fn() }))
vi.mock('./billing/agent-entitlement.js', () => ({ resolveWidgetAgentAccess: vi.fn() }))
vi.mock('./widget-session.js', async (original) => ({ ...await original<any>(), createWidgetHandoff: vi.fn(), exchangeWidgetHandoff: vi.fn(), requireWidgetSession: vi.fn(), assertWidgetProject: vi.fn() }))
vi.mock('./comment-activity.js', () => ({ notifyProjectMembersOfCommentActivityInBackground: vi.fn(), sendCommentActivityEmailInBackground: vi.fn() }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
import { requireUser } from './auth.js'
import { getServiceSupabase } from './supabase.js'
import { getComment, getProject, getProjectMember } from './store.js'
import { resolveWidgetAgentAccess } from './billing/agent-entitlement.js'
import { createWidgetHandoff, exchangeWidgetHandoff, requireWidgetSession, WidgetSessionError } from './widget-session.js'
import create from '../v1/storybook/pairings/index.js'
import validate from '../v1/storybook/pairings/validate.js'
import claim from '../v1/storybook/pairings/claim.js'
import handoff from '../v1/storybook/auth/handoff.js'
import exchange from '../v1/storybook/auth/exchange.js'
import eligibility from '../v1/storybook/connections/[connectionId]/eligibility.js'
import comments from '../v1/storybook/connections/[connectionId]/comments.js'
import manage from '../v1/storybook/connections/index.js'
const connectionId = '11111111-1111-4111-8111-111111111111'
const origin = 'http://localhost:6006'
const proof = 'a'.repeat(43)
const row = { id: connectionId, project_key: 'project', created_by: 'owner', expires_at: '2099-01-01', claimed_at: '2026-01-01', revoked_at: null }
const session = { user_id: 'member', project_key: 'project', origin, display_name: 'ada', expires_at: '2099-01-01' }
const body = { projectKey: 'project', pageUrl: `${origin}/?path=/story/button--primary`, selector: 'storybook://button--primary', x: 50, y: 50, body: 'Feedback\n\n— via Storybook · component: Button · story: Primary · id: button--primary' }
const commentRow = { id: 'comment', project_id: 'project', url: body.pageUrl, element: body.selector, x: 50, y: 50, comment: body.body, status: 'pending', visibility: 'shared', implementation_status: 'unassigned', author_name: 'ada', created_at: '2026-10-15' }
const client = { storybookVersion: '10.4.6', addonVersion: '0.2.0', packageManager: 'pnpm' }
function db(results: any[] = [{ data: row, error: null }]) {
  const queue = [...results]
  const q: any = {}
  for (const method of ['select', 'insert', 'update', 'eq', 'gt', 'is', 'order', 'limit']) q[method] = vi.fn(() => q)
  q.maybeSingle = q.single = vi.fn(async () => {
    if (!queue.length) throw new Error('Unexpected query')
    return queue.shift()
  })
  q.then = (resolve: any, reject: any) => Promise.resolve(queue.shift()).then(resolve, reject)
  const bucket: any = {
    upload: vi.fn(async () => ({ data: { path: 'uploaded' }, error: null })),
    remove: vi.fn(async () => ({ data: {}, error: null })),
  }
  const database: any = {
    from: vi.fn(() => q),
    rpc: vi.fn(() => q),
    storage: { from: vi.fn(() => bucket) },
  }
  vi.mocked(getServiceSupabase).mockReturnValue(database as never)
  return { q, database, bucket }
}
async function call(handler: typeof create, input: Record<string, unknown> = {}) {
  const req = { method: 'POST', headers: { origin, authorization: `Bearer crrt_widget_${proof}` }, query: { connectionId }, body, ...input }
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() }
  await handler(req as never, res as never)
  return { req, res, status: res.status.mock.calls[res.status.mock.calls.length - 1]?.[0], data: res.json.mock.calls[res.json.mock.calls.length - 1]?.[0] }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('APP_URL', 'https://crrt.test')
  vi.mocked(requireUser).mockResolvedValue({ userId: 'owner', email: 'ada@test.dev' })
  vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin', isOwner: true, feedbackAllowed: true })
  vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state: 'ready', role: 'member', collaboratorSeatLimit: 9 })
  vi.mocked(requireWidgetSession).mockResolvedValue(session)
  vi.mocked(getComment).mockResolvedValue({ id: 'comment', ...body } as never)
  vi.mocked(getProject).mockResolvedValue({ name: 'Project' } as never)
})
describe('Storybook route and CORS boundary', () => {
  it.each([create, validate, claim, handoff, exchange, eligibility, comments, manage])('handles preflight and rejects unsupported methods', async (handler) => {
    expect((await call(handler, { method: 'OPTIONS' })).status).toBe(204)
    expect((await call(handler, { method: 'PATCH' })).status).toBe(405)
  })
  it('reflects only canonical browser origins and never enables cookie credentials', async () => {
    const result = await call(comments, { method: 'OPTIONS' })
    expect(result.res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', origin)
    expect(result.res.setHeader).toHaveBeenCalledWith('Vary', 'Origin')
    expect(result.res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Credentials', expect.anything())
    for (const headers of [{ origin: 'null' }, { origin: 'https://bad.test/path' }, {}]) expect((await call(comments, { headers })).status).toBe(403)
    expect((await call(validate, { method: 'OPTIONS', headers: {} })).status).toBe(204)
  })
  it('requires a dashboard user and keeps exact CORS on authentication failures', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('X-Test', 'value')
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const result = await call(create)
    expect(result.status).toBe(401)
    expect(result.res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
  })
  it('sanitizes unexpected failures and maps widget errors', async () => {
    vi.mocked(getProjectMember).mockRejectedValue(new Error('private database secret'))
    expect((await call(create, { body: { projectKey: 'p' } })).data).toEqual({ code: 'error', message: 'Storybook is temporarily unavailable' })
    db(); vi.mocked(requireWidgetSession).mockRejectedValue(new WidgetSessionError(403, 'Origin denied'))
    expect((await call(eligibility, { method: 'GET' })).data).toEqual({ code: 'access_denied', message: 'Origin denied' })
  })
})
describe('pairing and connection lifecycle', () => {
  it('stores a hash and returns a five-minute code only to the owner', async () => {
    const { q } = db()
    const result = await call(create, { body: { projectKey: 'project' } })
    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({ connectionId, code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) })
    const inserted = q.insert.mock.calls[0][0]
    expect(inserted.code_hash).toBe(hashProof(result.data.code))
    expect(Date.parse(inserted.expires_at) - Date.parse(inserted.created_at)).toBe(300000)
    expect(JSON.stringify(inserted)).not.toContain(result.data.code)
  })
  it.each([null, { role: 'member' }, { role: 'admin', isOwner: true, feedbackAllowed: false }])('rejects revoked or unauthorized pairing creators %#', async (member) => {
    vi.mocked(getProjectMember).mockResolvedValue(member as never)
    expect((await call(create, { body: { projectKey: 'project' } })).status).toBe(403)
  })
  it('validates without consumption and claims with trusted public metadata', async () => {
    const { q } = db()
    expect((await call(validate, { body: { code: proof } })).data).toEqual({ valid: true, expiresAt: row.expires_at })
    expect(q.update).not.toHaveBeenCalled()
    const { database } = db([{ data: row, error: null }, { data: row, error: null }])
    const result = await call(claim, { body: { code: proof, ...client }, headers: {} })
    expect(result.data).toEqual({ connectionId, projectKey: 'project', apiBase: 'https://crrt.test/api', dashboardUrl: 'https://crrt.test' })
    expect(database.rpc).toHaveBeenCalledWith('claim_storybook_pairing', { p_hash: hashProof(proof), p_client: client })
  })
  it('requires configured trusted deployment URLs before claim', async () => {
    for (const url of ['', 'http://unsafe.test', 'https://crrt.test/path']) {
      vi.stubEnv('APP_URL', url)
      const { database } = db()
      expect((await call(claim, { body: { code: proof, ...client } })).status).toBe(500)
      expect(database.rpc).not.toHaveBeenCalled()
    }
  })
  it.each([undefined, null, [], {}, { code: 'short' }, { code: proof, packageManager: 'unknown' }])('rejects malformed pairing input %#', async (input) => {
    expect((await call(claim, { body: input })).status).toBe(400)
  })
  it('rejects expired codes, storage failures, and revoked creator access', async () => {
    db([{ data: null, error: null }]); expect((await call(validate, { body: { code: proof } })).status).toBe(400)
    db([{ data: null, error: { message: 'database error' } }]); expect((await call(validate, { body: { code: proof } })).status).toBe(500)
    db(); vi.mocked(getProjectMember).mockResolvedValue(null)
    expect((await call(claim, { body: { code: proof, ...client } })).status).toBe(403)
  })
  it.each([['invalid_pairing', 400], ['access_denied', 403], ['forbidden', 403], ['session_expired', 419], ['unknown secret', 500]])('maps transactional claim error %s', async (message, status) => {
    db([{ data: row, error: null }, { data: null, error: { message } }])
    expect((await call(claim, { body: { code: proof, ...client } })).status).toBe(status)
  })
  it('lists public status and revokes a project-scoped connection without requiring an upgrade', async () => {
    const { database } = db([{ data: { connections: [row] }, error: null }, { data: { revoked: true }, error: null }])
    const query = { projectKey: 'project', connectionId }
    expect((await call(manage, { method: 'GET', query })).data).toEqual({ connections: [row] })
    expect((await call(manage, { method: 'DELETE', query })).data).toEqual({ revoked: true })
    expect(database.rpc).toHaveBeenNthCalledWith(1, 'manage_storybook_connections', { p_project: 'project', p_actor: 'owner', p_connection: null })
    expect(database.rpc).toHaveBeenNthCalledWith(2, 'manage_storybook_connections', { p_project: 'project', p_actor: 'owner', p_connection: connectionId })
    expect(database.from).not.toHaveBeenCalled()
    expect(getProjectMember).not.toHaveBeenCalled()
  })
  it('rejects stale ownership and nonexistent revocations using the transaction result', async () => {
    for (const method of ['GET', 'DELETE']) {
      db([{ data: null, error: { message: 'access_denied' } }])
      expect((await call(manage, { method, query: { projectKey: 'p', connectionId } })).status).toBe(403)
    }
    expect((await call(manage, { method: 'DELETE', query: { projectKey: 'p' } })).status).toBe(400)
  })
})
describe('scoped authentication and eligibility', () => {
  it('reuses widget handoff and exchange with server-owned project and connection binding', async () => {
    db(); vi.mocked(createWidgetHandoff).mockResolvedValue({ code: proof, state: proof })
    expect((await call(handoff, { body: { connectionId, origin, state: proof, codeChallenge: proof } })).status).toBe(201)
    expect(createWidgetHandoff).toHaveBeenCalledWith({ projectKey: 'project', origin, state: proof, codeChallenge: proof }, { userId: 'owner', email: 'ada@test.dev' }, connectionId)
    db(); vi.mocked(exchangeWidgetHandoff).mockResolvedValue({ accessToken: 'scoped', displayName: 'ada', expiresAt: '2099' })
    expect((await call(exchange, { body: { connectionId, code: proof, state: proof, verifier: proof } })).status).toBe(200)
    expect(exchangeWidgetHandoff).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'project' }), origin, connectionId)
  })
  it.each([null, { ...row, claimed_at: null }, { ...row, revoked_at: 'today' }])('rejects nonexistent, unclaimed or revoked connections %#', async (data) => {
    db([{ data, error: null }]); expect((await call(eligibility, { method: 'GET' })).status).toBe(403)
  })
  it('returns existing eligibility without new entitlement rules', async () => {
    db(); const result = await call(eligibility, { method: 'GET' })
    expect(result.data).toEqual({ state: 'ready', role: 'member', collaboratorSeatLimit: 9 })
    expect(requireWidgetSession).toHaveBeenCalledWith(expect.anything(), connectionId)
    expect(resolveWidgetAgentAccess).toHaveBeenCalledWith('project', 'member')
  })
  it.each([['project_access_denied', 403], ['forbidden', 403], ['upgrade_required', 402], ['owner_upgrade_required', 402], ['seat_limit_reached', 409]])('preserves %s state', async (state, status) => {
    db(); vi.mocked(resolveWidgetAgentAccess).mockResolvedValue({ state } as never)
    const result = await call(eligibility, { method: 'GET' }); expect(result.status).toBe(status); expect(result.data.code).toBe(state)
  })
  it('rejects mismatched session projects and revoked feedback membership', async () => {
    db(); vi.mocked(requireWidgetSession).mockResolvedValue({ ...session, project_key: 'other' })
    expect((await call(eligibility, { method: 'GET' })).status).toBe(403)
    db(); vi.mocked(requireWidgetSession).mockResolvedValue(session); vi.mocked(getProjectMember).mockResolvedValue(null)
    expect((await call(eligibility, { method: 'GET' })).status).toBe(403)
  })
  it.each([[null, 401], [{ expires_at: '2000-01-01' }, 419], [{ expires_at: '2099-01-01' }, 401]])('distinguishes signed-out and expired sessions %#', async (expired, status) => {
    const { q } = db([{ data: row, error: null }, { data: expired, error: null }])
    vi.mocked(requireWidgetSession).mockRejectedValue(new WidgetSessionError(401, 'Sign in'))
    const result = await call(eligibility, { method: 'GET', headers: { origin, authorization: `Bearer crrt_widget_${proof}` } })
    expect(result.status).toBe(status)
    expect(q.eq).toHaveBeenCalledWith('token_hash', hashProof(`crrt_widget_${proof}`))
    expect(q.eq).toHaveBeenCalledWith('storybook_connection_id', connectionId)
    expect(q.eq).toHaveBeenCalledWith('origin', origin)
  })
  it('fails closed when signed-out eligibility lookup fails and sanitizes missing credentials', async () => {
    db([{ data: row, error: null }, { data: null, error: { message: 'secret' } }])
    vi.mocked(requireWidgetSession).mockRejectedValue(new WidgetSessionError(401, 'Sign in'))
    expect((await call(eligibility, { method: 'GET' })).status).toBe(500)
    db([{ data: row, error: null }, { data: null, error: null }])
    expect((await call(eligibility, { method: 'GET' })).status).toBe(401)
  })
})
describe('private Storybook comment submission', () => {
  it('preserves story context and derives author identity from the scoped session', async () => {
    const { database } = db([{ data: row, error: null }, { data: commentRow, error: null }])
    const result = await call(comments, { body: { ...body, authorName: 'spoofed' }, headers: { origin, authorization: `Bearer crrt_widget_${proof}` } })
    expect(result.status).toBe(201)
    expect(database.rpc).toHaveBeenCalledWith('create_storybook_comment_snapshot', {
      p_connection: connectionId, p_actor: 'member', p_origin: origin, p_token_hash: hashProof(`crrt_widget_${proof}`), p_comment: { ...body, authorName: 'ada', screenshotStoragePath: null },
    })
    expect(result.data.body).toContain('component: Button · story: Primary · id: button--primary')
  })
  it.each([{ body: '' }, { body: 'x'.repeat(8001) }, { x: Infinity }, { y: NaN }, { pageUrl: 'bad' }, { selector: '#button' }, { projectKey: '' }])('rejects malformed comments %#', async (change) => {
    expect((await call(comments, { body: { ...body, ...change } })).status).toBe(400)
  })
  it('rejects project or page-origin spoofing before insertion', async () => {
    for (const change of [{ projectKey: 'other-project' }, { pageUrl: 'https://evil.test/?path=/story/button--primary' }, { pageUrl: 'http://localhost:7007/?path=/story/button--primary' }]) {
      const { database } = db()
      expect((await call(comments, { body: { ...body, ...change } })).status).toBe(403)
      expect(database.rpc).not.toHaveBeenCalled()
    }
  })
  it('rejects mismatched story links', async () => {
    db(); expect((await call(comments, { body: { ...body, selector: 'storybook://another--story' } })).status).toBe(400)
  })
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
  ] as const)('stores a validated %s story screenshot with the private comment snapshot', async (mimeType, extension) => {
    const screenshot = Buffer.from('image-bytes').toString('base64')
    const withScreenshot = {
      ...commentRow,
      screenshot_storage_path: `member/storybook/image.${extension}`,
    }
    const { database, bucket } = db([{ data: row, error: null }, { data: withScreenshot, error: null }])
    const result = await call(comments, {
      body: { ...body, imageBase64: screenshot, imageMimeType: mimeType },
    })

    expect(result.status).toBe(201)
    const path = bucket.upload.mock.calls[0]?.[0] as string
    expect(path).toMatch(new RegExp(`^member/storybook/[0-9a-f-]+\\.${extension}$`))
    expect(bucket.upload).toHaveBeenCalledWith(
      path,
      Buffer.from('image-bytes'),
      { contentType: mimeType, upsert: false },
    )
    expect(database.rpc).toHaveBeenCalledWith(
      'create_storybook_comment_snapshot',
      expect.objectContaining({
        p_comment: expect.objectContaining({ screenshotStoragePath: path }),
      }),
    )
    const rpcComment = database.rpc.mock.calls[0]?.[1].p_comment
    expect(rpcComment).not.toHaveProperty('imageBase64')
    expect(rpcComment).not.toHaveProperty('imageMimeType')
  })
  it.each([
    { imageBase64: Buffer.from('x').toString('base64') },
    { imageMimeType: 'image/png' },
    { imageBase64: '', imageMimeType: 'image/png' },
    { imageBase64: '!!!!', imageMimeType: 'image/png' },
    { imageBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'), imageMimeType: 'image/png' },
    { imageBase64: Buffer.from('x').toString('base64'), imageMimeType: 'image/gif' },
  ])('rejects malformed private screenshots %#', async (screenshot) => {
    db()
    const result = await call(comments, { body: { ...body, ...screenshot } })
    expect(result.status, JSON.stringify(result.data)).toBe(400)
  })
  it('does not create a comment when screenshot storage fails', async () => {
    const { database, bucket } = db()
    bucket.upload.mockResolvedValueOnce({ data: null, error: { message: 'storage secret' } })

    const result = await call(comments, {
      body: {
        ...body,
        imageBase64: Buffer.from('png-bytes').toString('base64'),
        imageMimeType: 'image/png',
      },
    })

    expect(result.status).toBe(500)
    expect(result.data).toEqual({ code: 'error', message: 'Storybook is temporarily unavailable' })
    expect(database.rpc).not.toHaveBeenCalled()
  })
  it('removes an uploaded screenshot when comment creation fails', async () => {
    const { bucket } = db([
      { data: row, error: null },
      { data: null, error: { message: 'database error' } },
    ])

    const result = await call(comments, {
      body: {
        ...body,
        imageBase64: Buffer.from('png-bytes').toString('base64'),
        imageMimeType: 'image/png',
      },
    })

    expect(result.status).toBe(500)
    expect(bucket.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^member\/storybook\/[0-9a-f-]+\.png$/),
    ])
  })
  it('logs a screenshot cleanup response error without exposing it', async () => {
    const { bucket } = db([
      { data: row, error: null },
      { data: null, error: { message: 'database error' } },
    ])
    bucket.remove.mockResolvedValueOnce({ data: null, error: { message: 'cleanup response secret' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await call(comments, {
      body: {
        ...body,
        imageBase64: Buffer.from('png-bytes').toString('base64'),
        imageMimeType: 'image/png',
      },
    })

    expect(result.status).toBe(500)
    expect(log).toHaveBeenCalledWith(
      '[storybook] screenshot cleanup failed',
      { message: 'cleanup response secret' },
    )
  })
  it.each([
    new Error('cleanup unavailable'),
    'cleanup unavailable',
  ])('sanitizes screenshot cleanup exceptions after a failed comment (%#)', async (cleanupFailure) => {
    const { bucket } = db([
      { data: row, error: null },
      { data: null, error: { message: 'database error' } },
    ])
    bucket.remove.mockRejectedValueOnce(cleanupFailure)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await call(comments, {
      body: {
        ...body,
        imageBase64: Buffer.from('png-bytes').toString('base64'),
        imageMimeType: 'image/png',
      },
    })

    expect(result.status).toBe(500)
    expect(log).toHaveBeenCalledWith(
      '[storybook] screenshot cleanup failed',
      { message: cleanupFailure instanceof Error ? cleanupFailure.message : 'Unknown cleanup failure' },
    )
  })
  it('returns the transaction snapshot without reloading a subsequently internal comment', async () => {
    db([{ data: row, error: null }, { data: commentRow, error: null }])
    vi.mocked(getComment).mockResolvedValue({ id: 'comment', visibility: 'internal', implementationStatus: 'in_progress', claimedByAgentId: 'private-agent' } as never)
    const result = await call(comments)
    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({ id: 'comment', visibility: 'shared', implementationStatus: 'unassigned' })
    expect(result.data.claimedByAgentId).not.toBe('private-agent')
    expect(getComment).not.toHaveBeenCalled()
  })
  it('fails closed on a missing transaction result or disappeared project', async () => {
    db([{ data: row, error: null }, { data: null, error: null }])
    expect((await call(comments)).status).toBe(500)
    db([{ data: row, error: null }, { data: commentRow, error: null }]); vi.mocked(getProject).mockResolvedValue(null)
    expect((await call(comments)).status).toBe(403)
  })
  it.each(['subscription', 'comments'])('preserves existing Cloud %s limits', async (resource) => {
    const failure = { code: 'plan_limit', resource, usage: 2000, limit: 2000, resetAt: null, action: 'upgrade_or_wait' }
    db([{ data: row, error: null }, { data: null, error: { message: `cloud_plan_limit:${JSON.stringify(failure)}` } }])
    const result = await call(comments)
    expect(result.status).toBe(resource === 'subscription' ? 402 : 409)
    expect(result.data).toMatchObject(failure)
  })
})
