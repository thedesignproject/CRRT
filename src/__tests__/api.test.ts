import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createWidgetAgentSession,
  fetchAgentEligibility,
  fetchProjectComments,
  fetchWidgetAgentEligibility,
  mutateWidgetFeedback,
  patchReviewStatus,
  postComment,
  startWidgetAgentUpgrade,
} from '../components/FeedbackWidget/api'

const API = 'https://api.example.com'
const widgetSession = { accessToken: `crrt_widget_${'a'.repeat(43)}`, displayName: 'Ada', expiresAt: '2099-01-01T00:00:00Z' }

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('fetchProjectComments', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the comments endpoint with URL-encoded projectId', async () => {
    const spy = mockFetch(() => jsonResponse([]))
    await fetchProjectComments(API, 'acme/internal')
    expect(spy).toHaveBeenCalledWith(`${API}/v1/public/comments?projectKey=acme%2Finternal`)
  })

  it('normalizes reviewStatus on each comment', async () => {
    mockFetch(() => jsonResponse([
      { id: 'a', reviewStatus: 'accepted' },
      { id: 'b', reviewStatus: 'banana' },
      { id: 'c' },
    ]))
    const out = await fetchProjectComments(API, 'p')
    expect(out.map((c) => c.reviewStatus)).toEqual(['accepted', 'open', 'open'])
  })

  it('rejects transient errors so refresh preserves loaded feedback', async () => {
    mockFetch(() => new Response('boom', { status: 500 }))
    await expect(fetchProjectComments(API, 'p')).rejects.toThrow('Could not refresh feedback')
  })

  it('rejects malformed responses', async () => {
    mockFetch(() => jsonResponse({ items: [] }))
    await expect(fetchProjectComments(API, 'p')).rejects.toThrow('Invalid feedback response')
  })

  it('propagates network errors', async () => {
    mockFetch(() => { throw new Error('offline') })
    await expect(fetchProjectComments(API, 'p')).rejects.toThrow('offline')
  })
})

describe('fetchAgentEligibility', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hits /v1/agent/eligibility with the project_id query param', async () => {
    const spy = mockFetch(() => jsonResponse({}))
    await fetchAgentEligibility(API, 'acme/internal')
    const calledUrl = spy.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/v1/agent/eligibility')
    expect(calledUrl).toContain('project_id=acme%2Finternal')
  })

  it('maps the camelCase response shape', async () => {
    mockFetch(() => jsonResponse({
      canRequest: true,
      mustSignUp: true,
      isProjectMember: true,
      currentTier: 'pro',
    }))
    expect(await fetchAgentEligibility(API, 'p')).toEqual({
      canRequest: true,
      mustSignUp: true,
      isProjectMember: true,
      currentTier: 'pro',
    })
  })

  it('maps the snake_case response shape', async () => {
    mockFetch(() => jsonResponse({
      can_request: true,
      must_sign_up: true,
      is_project_member: true,
      current_tier: 'free',
    }))
    expect(await fetchAgentEligibility(API, 'p')).toEqual({
      canRequest: true,
      mustSignUp: true,
      isProjectMember: true,
      currentTier: 'free',
    })
  })

  it('defaults missing fields to false / null', async () => {
    mockFetch(() => jsonResponse({}))
    expect(await fetchAgentEligibility(API, 'p')).toEqual({
      canRequest: false,
      mustSignUp: false,
      isProjectMember: false,
      currentTier: null,
    })
  })

  it('returns null for non-OK responses', async () => {
    mockFetch(() => new Response('nope', { status: 404 }))
    expect(await fetchAgentEligibility(API, 'p')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    mockFetch(() => { throw new Error('offline') })
    expect(await fetchAgentEligibility(API, 'p')).toBeNull()
  })
})

describe('premium widget Agent API', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('checks eligibility with encoded page scope and widget authorization', async () => {
    const spy = mockFetch(() => jsonResponse({ state: 'ready', comments: [] }))
    await fetchWidgetAgentEligibility(API, 'acme/internal', 'https://site.test/a b', widgetSession)
    const [url, init] = spy.mock.calls[0]!
    expect(url).toContain('/v1/widget/agent/eligibility?')
    expect(new URL(url as string).searchParams.get('projectKey')).toBe('acme/internal')
    expect(new URL(url as string).searchParams.get('pageUrl')).toBe('https://site.test/a b')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${widgetSession.accessToken}` })
  })

  it('creates exact sessions and lifecycle mutations through authenticated widget endpoints', async () => {
    const spy = mockFetch(() => jsonResponse({ slug: 's', token: 't' }))
    const handoff = { projectKey: 'p', pageUrl: 'https://site.test', commentIds: ['c1'], idempotencyKey: 'idem' }
    const lifecycle = { projectKey: 'p', pageUrl: 'https://site.test', commentIds: ['c1'], action: 'accept' as const }
    await createWidgetAgentSession(API, handoff, widgetSession)
    await mutateWidgetFeedback(API, lifecycle, widgetSession)
    await startWidgetAgentUpgrade(API, { projectKey: 'p', pageUrl: 'https://site.test' }, widgetSession)

    expect(spy.mock.calls.map(([url]) => url)).toEqual([
      `${API}/v1/widget/agent/session`,
      `${API}/v1/widget/feedback`,
      `${API}/v1/widget/agent/upgrade`,
    ])
    expect(spy.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST', 'POST'])
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual(handoff)
    expect(JSON.parse(spy.mock.calls[1]![1]!.body as string)).toEqual(lifecycle)
    for (const [, init] of spy.mock.calls) {
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${widgetSession.accessToken}` })
    }
  })
})

describe('postComment', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs JSON and returns the parsed body on success', async () => {
    const spy = mockFetch(() => jsonResponse({ id: '1', body: 'hi' }))
    const result = await postComment(API, { body: 'hi' })
    expect(result).toEqual({ id: '1', body: 'hi' })
    const init = spy.mock.calls[0]![1]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ body: 'hi' })
  })

  it('returns null and warns on non-OK response', async () => {
    mockFetch(() => new Response('nope', { status: 422 }))
    const result = await postComment(API, { body: 'hi' })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('patchReviewStatus', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('PATCHes id + reviewStatus as JSON', async () => {
    const spy = mockFetch(() => jsonResponse({}))
    await patchReviewStatus(API, 'abc', 'accepted')
    const [, init] = spy.mock.calls[0]!
    expect(init!.method).toBe('PATCH')
    expect(JSON.parse(init!.body as string)).toEqual({ id: 'abc', reviewStatus: 'accepted' })
  })

  it('swallows fetch errors and warns', async () => {
    mockFetch(() => { throw new Error('boom') })
    await expect(patchReviewStatus(API, 'abc', 'accepted')).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

it('reports private mode and requests login after an anonymous submit is rejected', async () => {
  mockFetch(() => new Response('{}', { status: 401 }))
  const privacy = vi.fn(), login = vi.fn()
  expect(await fetchProjectComments(API, 'private', privacy)).toEqual([])
  expect(privacy).toHaveBeenCalledWith(true)
  expect(await postComment(API, {}, login)).toBeNull()
  expect(login).toHaveBeenCalledOnce()
  await postComment(API, {})
})
