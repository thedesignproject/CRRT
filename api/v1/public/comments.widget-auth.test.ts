import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ ensurePublicProject: vi.fn(), createPublicComment: vi.fn(), getComment: vi.fn(), listComments: vi.fn(), listProjectMembers: vi.fn(), notifyProjectMembersOfCommentActivity: vi.fn(), releaseCommentActivityEmailReservation: vi.fn(), removeGuestCommentActivityNotifications: vi.fn(), reserveCommentActivityEmail: vi.fn(), updateReviewStatus: vi.fn(), deleteCommentById: vi.fn(), deleteCommentsForProject: vi.fn() }))
vi.mock('../../_lib/comment-activity-email.js', () => ({ hasCommentActivityEmailConfig: () => false }))
vi.mock('../../_lib/widget-session.js', async (original) => ({ ...await original<any>(), requireWidgetSession: vi.fn() }))
import { createPublicComment, ensurePublicProject, getComment, updateReviewStatus } from '../../_lib/store.js'
import { requireWidgetSession, WidgetSessionError } from '../../_lib/widget-session.js'
import handler from './comments.js'
const payload = { projectKey: 'p', pageUrl: 'https://site.test/page', selector: 'h1', x: 1, y: 2, body: 'hello', authorName: 'spoofed' }
const session = { user_id: 'u', project_key: 'p', origin: 'https://site.test', display_name: 'Ada', expires_at: 'later' }
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() } }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireWidgetSession).mockResolvedValue(session); vi.mocked(ensurePublicProject).mockResolvedValue({ allowedOrigins: [], name: 'P' } as never); vi.mocked(createPublicComment).mockResolvedValue({ id: 'c', authorName: 'Ada' } as never) })
it('records trusted account ownership and name without accepting caller-supplied identity', async () => {
  const res = response(); await handler({ method: 'POST', query: {}, body: { ...payload, userId: 'attacker' }, headers: { authorization: 'Bearer token', origin: session.origin } } as never, res as never)
  expect(res.status).toHaveBeenCalledWith(201)
  expect(createPublicComment).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u', authorName: 'Ada' }))
})
it('rejects expired credentials and cross-domain submissions without guest fallback', async () => {
  for (const body of [{ ...payload, pageUrl: 'https://other.test' }, { ...payload, projectKey: 'other' }]) {
    const res = response(); await handler({ method: 'POST', body, headers: { authorization: 'Bearer token' } } as never, res as never); expect(res.status).toHaveBeenCalledWith(403)
  }
  vi.mocked(requireWidgetSession).mockRejectedValue(new WidgetSessionError(401, 'expired'))
  const res = response(); await handler({ method: 'POST', body: payload, headers: { authorization: 'Bearer token' } } as never, res as never)
  expect(res.status).toHaveBeenCalledWith(401); expect(createPublicComment).not.toHaveBeenCalled()
})
it('does not let the anonymous review API change account-owned feedback', async () => {
  vi.mocked(getComment).mockResolvedValue({ id: 'c', projectId: 'p', visibility: 'shared', createdByUserId: 'u' } as never)
  const res = response(); await handler({ method: 'PATCH', headers: {}, body: { id: 'c', reviewStatus: 'accepted' } } as never, res as never)
  expect(res.status).toHaveBeenCalledWith(404); expect(updateReviewStatus).not.toHaveBeenCalled()
})
