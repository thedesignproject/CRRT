import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_lib/store.js', () => ({
  ensurePublicProject: vi.fn(),
  createPublicComment: vi.fn(),
  listComments: vi.fn(),
  listProjectMembers: vi.fn(),
  releaseCommentActivityEmailReservation: vi.fn(),
  reserveCommentActivityEmail: vi.fn(),
  updateReviewStatus: vi.fn(),
  deleteCommentsForProject: vi.fn(),
}))

vi.mock('../../_lib/supabase.js', () => ({ getServiceSupabase: vi.fn() }))
vi.mock('../../_lib/comment-activity-email.js', () => ({
  canSendCommentActivityEmail: vi.fn(),
  getCommentActivityCooldownSeconds: vi.fn(),
  getCommentActivityDashboardUrl: vi.fn(),
  hasCommentActivityEmailConfig: vi.fn(),
  sendCommentActivityEmail: vi.fn(),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

import { waitUntil } from '@vercel/functions'
import { canSendCommentActivityEmail, getCommentActivityCooldownSeconds, getCommentActivityDashboardUrl, hasCommentActivityEmailConfig, sendCommentActivityEmail } from '../../_lib/comment-activity-email.js'
import { createPublicComment, deleteCommentsForProject, ensurePublicProject, listComments, listProjectMembers, releaseCommentActivityEmailReservation, reserveCommentActivityEmail, updateReviewStatus } from '../../_lib/store.js'
import { getServiceSupabase } from '../../_lib/supabase.js'
import handler from './comments.js'

interface MockRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
  status(code: number): MockRes
  json(data: unknown): MockRes
  end(): MockRes
  setHeader(key: string, value: string): void
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { method: 'POST', query: {}, body: {}, headers: {}, ...overrides }
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

function mockRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
    end() {
      return this
    },
    setHeader(key, value) {
      this.headers[key] = value
    },
  }
}

const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(ensurePublicProject).mockReset()
  vi.mocked(createPublicComment).mockReset()
  vi.mocked(listComments).mockReset()
  vi.mocked(listProjectMembers).mockReset()
  vi.mocked(releaseCommentActivityEmailReservation).mockReset()
  vi.mocked(reserveCommentActivityEmail).mockReset()
  vi.mocked(updateReviewStatus).mockReset()
  vi.mocked(deleteCommentsForProject).mockReset()
  vi.mocked(getServiceSupabase).mockReset()
  vi.mocked(canSendCommentActivityEmail).mockReset()
  vi.mocked(getCommentActivityCooldownSeconds).mockReset()
  vi.mocked(getCommentActivityDashboardUrl).mockReset()
  vi.mocked(hasCommentActivityEmailConfig).mockReset()
  vi.mocked(sendCommentActivityEmail).mockReset()
  vi.mocked(waitUntil).mockReset()
  vi.mocked(canSendCommentActivityEmail).mockReturnValue(false)
  vi.mocked(getCommentActivityCooldownSeconds).mockReturnValue(18_000)
  vi.mocked(getCommentActivityDashboardUrl).mockReturnValue('https://crrt.ai/dashboard')
  vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(false)
  vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: false, activityCount: 0 })
  vi.mocked(listProjectMembers).mockResolvedValue([])
  vi.mocked(releaseCommentActivityEmailReservation).mockResolvedValue(undefined)
  vi.mocked(sendCommentActivityEmail).mockResolvedValue({ skipped: true })
  delete process.env.SMOKE_CLEANUP_TOKEN
  delete process.env.SMOKE_PROJECT_KEY
})

describe('api/v1/public/comments', () => {
  it('answers CORS preflight for cross-origin PATCH requests', async () => {
    const res = mockRes()
    await call(mockReq({
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example',
        'access-control-request-headers': 'content-type, x-client-version',
      },
    }), res)

    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(res.headers['Access-Control-Allow-Methods']).toContain('PATCH')
    expect(res.headers['Access-Control-Allow-Headers']).toBe('content-type, x-client-version')
    expect(res.headers['Access-Control-Max-Age']).toBe('86400')
  })

  it('returns 400 when projectKey is missing on GET', async () => {
    const res = mockRes()
    await call(mockReq({ method: 'GET', query: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })

  it('auto-creates the project when the key is unknown', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'missing',
      slug: 'missing',
      name: 'missing',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'missing',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hi',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'missing',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hi',
      },
    }), res)

    expect(ensurePublicProject).toHaveBeenCalledWith('missing')
    expect(res.statusCode).toBe(201)
  })

  it('uploads an image via the service-role client and stores its public URL', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example/img.png' } })
    vi.mocked(getServiceSupabase).mockReturnValue({
      storage: { from: () => ({ upload, getPublicUrl }) },
    } as never)
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hi',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: 'https://cdn.example/img.png',
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hi',
        imageBase64: Buffer.from('png-bytes').toString('base64'),
        imageMimeType: 'image/png',
      },
    }), res)

    expect(upload).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(201)
    expect(vi.mocked(createPublicComment).mock.calls[0]?.[0].imageUrl).toBe('https://cdn.example/img.png')
  })

  it('creates a public comment', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })

    const res = mockRes()
    await call(mockReq({
      headers: { origin: 'https://example.com' },
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(createPublicComment).toHaveBeenCalledWith({
      projectKey: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      imageUrl: null,
      authorName: null,
      targetType: 'element_point',
      anchor: null,
    })
    expect(reserveCommentActivityEmail).not.toHaveBeenCalled()
    expect(sendCommentActivityEmail).not.toHaveBeenCalled()
  })

  it('sends an activity email to project members by BCC when cooldown opens', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'Mira',
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 2 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(true)
    vi.mocked(listProjectMembers).mockResolvedValue([
      { userId: 'u1', email: 'a@example.com', role: 'admin', createdAt: '' },
      { userId: 'u2', email: null, role: 'member', createdAt: '' },
      { userId: 'u3', email: 'b@example.com', role: 'member', createdAt: '' },
    ])

    const res = mockRes()
    await call(mockReq({
      headers: { host: 'crrt.ai', 'x-forwarded-proto': 'https' },
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(reserveCommentActivityEmail).toHaveBeenCalledWith('demo-project', 18_000)
    expect(listProjectMembers).toHaveBeenCalledWith('demo-project')
    expect(vi.mocked(reserveCommentActivityEmail).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(listProjectMembers).mock.invocationCallOrder[0],
    )
    expect(canSendCommentActivityEmail).toHaveBeenCalledWith(['a@example.com', 'b@example.com'])
    expect(sendCommentActivityEmail).toHaveBeenCalledWith({
      recipients: ['a@example.com', 'b@example.com'],
      projectName: 'Demo',
      pageUrl: 'https://example.com',
      authorName: 'Mira',
      activityCount: 2,
      dashboardUrl: 'https://crrt.ai/dashboard',
    })
  })

  it('returns 201 without waiting for a hung activity email send', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: 'Mira',
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 1 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(true)
    vi.mocked(listProjectMembers).mockResolvedValue([
      { userId: 'u1', email: 'a@example.com', role: 'admin', createdAt: '' },
    ])
    vi.mocked(sendCommentActivityEmail).mockReturnValue(new Promise(() => {}) as never)

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)
    await flushMicrotasks()

    expect(res.statusCode).toBe(201)
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    expect(sendCommentActivityEmail).toHaveBeenCalled()
  })

  it('skips member resolution when activity email config is disabled', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(false)

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(listProjectMembers).not.toHaveBeenCalled()
    expect(reserveCommentActivityEmail).not.toHaveBeenCalled()
    expect(sendCommentActivityEmail).not.toHaveBeenCalled()
  })

  it('does not send an activity email while the project is cooling down', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(true)
    vi.mocked(listProjectMembers).mockResolvedValue([
      { userId: 'u1', email: 'a@example.com', role: 'admin', createdAt: '' },
    ])

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(reserveCommentActivityEmail).toHaveBeenCalledWith('demo-project', 18_000)
    expect(listProjectMembers).not.toHaveBeenCalled()
    expect(canSendCommentActivityEmail).not.toHaveBeenCalled()
    expect(sendCommentActivityEmail).not.toHaveBeenCalled()
  })

  it('releases an opened cooldown reservation when no email recipients resolve', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 3 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(false)
    vi.mocked(listProjectMembers).mockResolvedValue([
      { userId: 'u1', email: null, role: 'admin', createdAt: '' },
    ])

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(releaseCommentActivityEmailReservation).toHaveBeenCalledWith('demo-project', 3)
    expect(sendCommentActivityEmail).not.toHaveBeenCalled()
  })

  it('does not release missing-recipient reservations when zero cooldown is configured', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(getCommentActivityCooldownSeconds).mockReturnValue(0)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 1 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(false)
    vi.mocked(listProjectMembers).mockResolvedValue([
      { userId: 'u1', email: null, role: 'admin', createdAt: '' },
    ])

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(releaseCommentActivityEmailReservation).not.toHaveBeenCalled()
    expect(sendCommentActivityEmail).not.toHaveBeenCalled()
  })

  it('does not fail comment creation when activity email delivery fails', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 1 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(true)
    vi.mocked(sendCommentActivityEmail).mockRejectedValue(new Error('resend down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)
    await flushMicrotasks()

    expect(res.statusCode).toBe(201)
    expect(releaseCommentActivityEmailReservation).toHaveBeenCalledWith('demo-project', 1)
    expect(warn).toHaveBeenCalledWith('Comment activity email failed', expect.any(Error))
    warn.mockRestore()
  })

  it('does not release a cooldown reservation when zero cooldown send fails', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(hasCommentActivityEmailConfig).mockReturnValue(true)
    vi.mocked(getCommentActivityCooldownSeconds).mockReturnValue(0)
    vi.mocked(reserveCommentActivityEmail).mockResolvedValue({ shouldSend: true, activityCount: 1 })
    vi.mocked(canSendCommentActivityEmail).mockReturnValue(true)
    vi.mocked(sendCommentActivityEmail).mockRejectedValue(new Error('resend down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)
    await flushMicrotasks()

    expect(res.statusCode).toBe(201)
    expect(releaseCommentActivityEmailReservation).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('Comment activity email failed', expect.any(Error))
    warn.mockRestore()
  })

  it('rejects non-finite coordinates before creating a comment', async () => {
    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: Number.NaN,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'x and y must be finite numbers' })
    expect(createPublicComment).not.toHaveBeenCalled()
  })

  it('validates optional author names', async () => {
    const nonStringRes = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        authorName: 42,
      },
    }), nonStringRes)
    expect(nonStringRes.statusCode).toBe(400)
    expect(nonStringRes.body).toEqual({ error: 'authorName must be a string' })

    const longNameRes = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        authorName: 'a'.repeat(81),
      },
    }), longNameRes)
    expect(longNameRes.statusCode).toBe(400)
    expect(longNameRes.body).toEqual({ error: 'authorName must be 80 characters or fewer' })

    expect(createPublicComment).not.toHaveBeenCalled()
  })

  it('normalizes blank author names to null', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'open',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        authorName: '   ',
      },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(vi.mocked(createPublicComment).mock.calls[0]?.[0].authorName).toBeNull()
  })

  it('validates optional image payload metadata', async () => {
    const missingMimeRes = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        imageBase64: 'abc123',
      },
    }), missingMimeRes)
    expect(missingMimeRes.statusCode).toBe(400)
    expect(missingMimeRes.body).toEqual({ error: 'imageBase64 and imageMimeType must both be strings' })

    const badMimeRes = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        imageBase64: 'abc123',
        imageMimeType: 'image/bmp',
      },
    }), badMimeRes)
    expect(badMimeRes.statusCode).toBe(400)
    expect(badMimeRes.body).toEqual({ error: 'imageMimeType must be image/png, image/jpeg, image/webp, or image/gif' })

    expect(createPublicComment).not.toHaveBeenCalled()
  })

  it('returns 500 when comment creation fails unexpectedly', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockRejectedValue(new Error('insert exploded'))

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'insert exploded' })
  })

  it('returns a generic 500 for non-error comment creation failures', async () => {
    vi.mocked(ensurePublicProject).mockResolvedValue({
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: [],
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(createPublicComment).mockRejectedValue('boom')

    const res = mockRes()
    await call(mockReq({
      body: {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
      },
    }), res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Unexpected error' })
  })

  describe('text_range targets', () => {
    const validAnchor = {
      kind: 'text_range',
      selectedText: 'términos y condiciones',
      normalizedText: 'términos y condiciones',
      prefix: 'sujeto a los ',
      suffix: ' vigentes',
      containerSelector: 'section.plans > p.disclaimer',
      startOffset: 13,
      endOffset: 35,
      createdFromUrl: 'https://example.com/pricing',
    }

    function postBody(overrides: Record<string, unknown> = {}) {
      return {
        projectKey: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'section.plans > p.disclaimer',
        x: 10,
        y: 20,
        body: 'Soften this copy',
        ...overrides,
      }
    }

    it('creates a text_range comment with a sanitized anchor', async () => {
      vi.mocked(ensurePublicProject).mockResolvedValue({
        publicKey: 'demo-project',
        slug: 'demo-project',
        name: 'Demo',
        allowedOrigins: [],
        createdAt: '',
        updatedAt: '',
      })
      vi.mocked(createPublicComment).mockResolvedValue({
        id: 'comment-2',
        projectId: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'section.plans > p.disclaimer',
        x: 10,
        y: 20,
        body: 'Soften this copy',
        reviewStatus: 'open',
        implementationStatus: 'unassigned',
        claimedByAgentId: null,
        imageUrl: null,
        authorName: null,
        targetType: 'text_range' as const,
        anchor: validAnchor,
        createdAt: '',
        updatedAt: '',
      })

      const res = mockRes()
      await call(mockReq({
        body: postBody({
          targetType: 'text_range',
          anchor: { ...validAnchor, junkKey: 'dropped' },
        }),
      }), res)

      expect(res.statusCode).toBe(201)
      const input = vi.mocked(createPublicComment).mock.calls[0]?.[0]
      expect(input?.targetType).toBe('text_range')
      expect(input?.anchor).toEqual(validAnchor)
    })

    it('rejects an unknown targetType', async () => {
      const res = mockRes()
      await call(mockReq({ body: postBody({ targetType: 'pixel_blob' }) }), res)
      expect(res.statusCode).toBe(400)
      expect(createPublicComment).not.toHaveBeenCalled()
    })

    it('rejects text_range without an anchor', async () => {
      const res = mockRes()
      await call(mockReq({ body: postBody({ targetType: 'text_range' }) }), res)
      expect(res.statusCode).toBe(400)
      expect(createPublicComment).not.toHaveBeenCalled()
    })

    it('rejects an anchor on element_point payloads', async () => {
      const res = mockRes()
      await call(mockReq({ body: postBody({ anchor: validAnchor }) }), res)
      expect(res.statusCode).toBe(400)
      expect(createPublicComment).not.toHaveBeenCalled()
    })
  })

  describe('origin allowlist', () => {
    const project = {
      publicKey: 'demo-project',
      slug: 'demo-project',
      name: 'Demo',
      allowedOrigins: ['example.com'],
      createdAt: '',
      updatedAt: '',
    }
    const postBody = {
      projectKey: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
    }

    it('rejects POSTs from origins outside the allowlist', async () => {
      vi.mocked(ensurePublicProject).mockResolvedValue(project)

      const res = mockRes()
      await call(mockReq({ headers: { origin: 'https://evil.com' }, body: postBody }), res)

      expect(res.statusCode).toBe(403)
      expect(createPublicComment).not.toHaveBeenCalled()
    })

    it('rejects POSTs without an Origin or Referer when the allowlist is set', async () => {
      vi.mocked(ensurePublicProject).mockResolvedValue(project)

      const res = mockRes()
      await call(mockReq({ headers: {}, body: postBody }), res)

      expect(res.statusCode).toBe(403)
      expect(createPublicComment).not.toHaveBeenCalled()
    })

    it('accepts POSTs from an allowed subdomain', async () => {
      vi.mocked(ensurePublicProject).mockResolvedValue(project)
      vi.mocked(createPublicComment).mockResolvedValue({
        id: 'comment-1',
        projectId: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        reviewStatus: 'open',
        implementationStatus: 'unassigned',
        claimedByAgentId: null,
        imageUrl: null,
        authorName: null,
        targetType: 'element_point' as const,
        anchor: null,
        createdAt: '',
        updatedAt: '',
      })

      const res = mockRes()
      await call(mockReq({ headers: { origin: 'https://app.example.com' }, body: postBody }), res)

      expect(res.statusCode).toBe(201)
      expect(createPublicComment).toHaveBeenCalledOnce()
    })
  })

  describe('DELETE (smoke cleanup)', () => {
    it('returns 405 when cleanup is not configured on the server', async () => {
      const res = mockRes()
      await call(mockReq({ method: 'DELETE', query: { projectKey: 'smoke' }, headers: { 'x-smoke-cleanup-token': 'tok' } }), res)
      expect(res.statusCode).toBe(405)
      expect(deleteCommentsForProject).not.toHaveBeenCalled()
    })

    it('returns 401 when token is missing or wrong', async () => {
      process.env.SMOKE_CLEANUP_TOKEN = 'expected'
      process.env.SMOKE_PROJECT_KEY = 'smoke'

      const noTokenRes = mockRes()
      await call(mockReq({ method: 'DELETE', query: { projectKey: 'smoke' }, headers: {} }), noTokenRes)
      expect(noTokenRes.statusCode).toBe(401)

      const wrongTokenRes = mockRes()
      await call(mockReq({ method: 'DELETE', query: { projectKey: 'smoke' }, headers: { 'x-smoke-cleanup-token': 'wrong' } }), wrongTokenRes)
      expect(wrongTokenRes.statusCode).toBe(401)

      expect(deleteCommentsForProject).not.toHaveBeenCalled()
    })

    it('returns 403 when projectKey does not match the configured smoke project', async () => {
      process.env.SMOKE_CLEANUP_TOKEN = 'expected'
      process.env.SMOKE_PROJECT_KEY = 'smoke'

      const res = mockRes()
      await call(mockReq({
        method: 'DELETE',
        query: { projectKey: 'demo-project' },
        headers: { 'x-smoke-cleanup-token': 'expected' },
      }), res)

      expect(res.statusCode).toBe(403)
      expect(deleteCommentsForProject).not.toHaveBeenCalled()
    })

    it('deletes comments for the smoke project when token and key match', async () => {
      process.env.SMOKE_CLEANUP_TOKEN = 'expected'
      process.env.SMOKE_PROJECT_KEY = 'smoke'
      vi.mocked(deleteCommentsForProject).mockResolvedValue(undefined)

      const res = mockRes()
      await call(mockReq({
        method: 'DELETE',
        query: { projectKey: 'smoke' },
        headers: { 'x-smoke-cleanup-token': 'expected' },
      }), res)

      expect(res.statusCode).toBe(204)
      expect(deleteCommentsForProject).toHaveBeenCalledWith('smoke')
    })
  })

  it('updates a comment review status for widget compatibility', async () => {
    vi.mocked(updateReviewStatus).mockResolvedValue({
      id: 'comment-1',
      projectId: 'demo-project',
      pageUrl: 'https://example.com',
      selector: 'body',
      x: 10,
      y: 20,
      body: 'Hello',
      reviewStatus: 'accepted',
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
      imageUrl: null,
      authorName: null,
      targetType: 'element_point' as const,
      anchor: null,
      createdAt: '',
      updatedAt: '',
    })

    const res = mockRes()
    await call(mockReq({
      method: 'PATCH',
      headers: { origin: 'https://example.com' },
      body: { id: 'comment-1', reviewStatus: 'accepted' },
    }), res)

    expect(updateReviewStatus).toHaveBeenCalledWith('comment-1', 'accepted')
    expect(res.statusCode).toBe(200)
    expect((res.body as Record<string, unknown>).reviewStatus).toBe('accepted')
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })

  it('normalizes widget review status aliases on PATCH', async () => {
    vi.mocked(updateReviewStatus)
      .mockResolvedValueOnce({
        id: 'comment-1',
        projectId: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        reviewStatus: 'rejected',
        implementationStatus: 'unassigned',
        claimedByAgentId: null,
        imageUrl: null,
        authorName: null,
        targetType: 'element_point' as const,
        anchor: null,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 'comment-1',
        projectId: 'demo-project',
        pageUrl: 'https://example.com',
        selector: 'body',
        x: 10,
        y: 20,
        body: 'Hello',
        reviewStatus: 'open',
        implementationStatus: 'unassigned',
        claimedByAgentId: null,
        imageUrl: null,
        authorName: null,
        targetType: 'element_point' as const,
        anchor: null,
        createdAt: '',
        updatedAt: '',
      })

    const rejectedRes = mockRes()
    await call(mockReq({
      method: 'PATCH',
      body: { id: 'comment-1', reviewStatus: 'rejected' },
    }), rejectedRes)

    const pendingRes = mockRes()
    await call(mockReq({
      method: 'PATCH',
      body: { id: 'comment-1', reviewStatus: 'pending' },
    }), pendingRes)

    expect(updateReviewStatus).toHaveBeenNthCalledWith(1, 'comment-1', 'rejected')
    expect(updateReviewStatus).toHaveBeenNthCalledWith(2, 'comment-1', 'open')
    expect(rejectedRes.statusCode).toBe(200)
    expect(pendingRes.statusCode).toBe(200)
  })

  it('rejects invalid widget review status values on PATCH', async () => {
    const res = mockRes()
    await call(mockReq({
      method: 'PATCH',
      body: { id: 'comment-1', reviewStatus: 'done' },
    }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'reviewStatus must be open, accepted, or rejected' })
    expect(updateReviewStatus).not.toHaveBeenCalled()
  })
})
