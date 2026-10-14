import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('./widget-session.js', () => ({
  WidgetSessionError: class WidgetSessionError extends Error { constructor(public status: number, message: string) { super(message) } },
  requireWidgetSession: vi.fn(),
  assertWidgetPage: vi.fn(),
}))
vi.mock('./http.js', () => ({ jsonError: vi.fn() }))

import { requireCommentActor } from './comment-actor.js'
import { requireUser } from './auth.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from './widget-session.js'
import { jsonError } from './http.js'

const comment = { projectId: 'project', pageUrl: 'https://site.example/pricing' }
const response = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'dashboard-user', email: 'user@example.com' })
  vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'widget-user', project_key: 'project', origin: 'https://site.example', display_name: 'Ada', expires_at: 'later' })
})

describe('requireCommentActor', () => {
  it('keeps normal dashboard authentication unchanged', async () => {
    const request = { headers: { authorization: 'Bearer supabase-token' } } as never
    await expect(requireCommentActor(request, response, comment)).resolves.toEqual({ userId: 'dashboard-user', email: 'user@example.com' })
    expect(requireWidgetSession).not.toHaveBeenCalled()
  })

  it('accepts an origin-bound widget session and checks its comment scope', async () => {
    const request = { headers: { authorization: `Bearer crrt_widget_${'a'.repeat(43)}` } } as never
    await expect(requireCommentActor(request, response, comment)).resolves.toEqual({ userId: 'widget-user', email: '' })
    expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'widget-user' }), 'project', comment.pageUrl)
  })

  it('returns safe widget authentication errors', async () => {
    const request = { headers: { authorization: `Bearer crrt_widget_${'a'.repeat(43)}` } } as never
    vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401, 'Sign in again'))
    await expect(requireCommentActor(request, response, comment)).resolves.toBeNull()
    expect(jsonError).toHaveBeenLastCalledWith(request, response, 401, 'Sign in again')

    vi.mocked(requireWidgetSession).mockRejectedValueOnce(new Error('database secret'))
    await expect(requireCommentActor(request, response, comment)).resolves.toBeNull()
    expect(jsonError).toHaveBeenLastCalledWith(request, response, 500, 'Widget authentication failed')
  })

  it('rejects widget access to feedback without an origin-bound page', async () => {
    const request = { headers: { authorization: `Bearer crrt_widget_${'a'.repeat(43)}` } } as never
    await expect(requireCommentActor(request, response, { projectId: 'project', pageUrl: null })).resolves.toBeNull()
    expect(jsonError).toHaveBeenLastCalledWith(request, response, 403, 'Widget session does not allow this feedback')
  })
})
