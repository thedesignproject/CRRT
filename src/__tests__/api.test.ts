import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchAgentEligibility, fetchProjectComments, patchReviewStatus, postComment } from '../components/FeedbackWidget/api'

const API = 'https://api.example.com'

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

  it('returns [] for non-OK responses', async () => {
    mockFetch(() => new Response('boom', { status: 500 }))
    expect(await fetchProjectComments(API, 'p')).toEqual([])
  })

  it('returns [] when body is not an array', async () => {
    mockFetch(() => jsonResponse({ items: [] }))
    expect(await fetchProjectComments(API, 'p')).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    mockFetch(() => { throw new Error('offline') })
    expect(await fetchProjectComments(API, 'p')).toEqual([])
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
