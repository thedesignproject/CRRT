import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../_lib/store.js', () => ({ mutateWidgetFeedbackBatch: vi.fn(), findActiveSharesForComment: vi.fn(), createFeedbackEvent: vi.fn() }))
vi.mock('../../_lib/external-work-sync.js', () => ({ closeLinkedExternalWork: vi.fn() }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('../../_lib/widget-session.js', async (original) => ({
  ...await original<any>(), requireWidgetSession: vi.fn(), assertWidgetPage: vi.fn(),
}))
import { waitUntil } from '@vercel/functions'
import { closeLinkedExternalWork } from '../../_lib/external-work-sync.js'
import { createFeedbackEvent, findActiveSharesForComment, mutateWidgetFeedbackBatch } from '../../_lib/store.js'
import { assertWidgetPage, requireWidgetSession, WidgetSessionError } from '../../_lib/widget-session.js'
import handler from './feedback.js'

const id = '11111111-1111-4111-8111-111111111111'
const body = { projectKey: 'p', pageUrl: 'https://example.com/page', commentIds: [id], action: 'accept' }
const response = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() })
async function call(nextBody: unknown = body, method = 'POST') {
  const res = response(); await handler({ method, body: nextBody, headers: {}, query: {} } as never, res as never); return res
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(findActiveSharesForComment).mockResolvedValue([])
  vi.mocked(closeLinkedExternalWork).mockResolvedValue(undefined as never)
  vi.mocked(requireWidgetSession).mockResolvedValue({ user_id: 'u', project_key: 'p', origin: 'https://example.com', display_name: 'Ada', expires_at: 'later' })
  vi.mocked(mutateWidgetFeedbackBatch).mockResolvedValue([{ id, body: 'Fix it' }] as never)
})

it('validates methods and exact feedback action input', async () => {
  expect((await call(body, 'OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call(body, 'GET')).status).toHaveBeenCalledWith(405)
  for (const invalid of [null, {}, { ...body, action: 'erase' }, { ...body, commentIds: [] }, { ...body, commentIds: ['bad'] }, { ...body, commentIds: [id, id] }]) {
    expect((await call(invalid)).status).toHaveBeenCalledWith(400)
  }
  expect(requireWidgetSession).toHaveBeenCalledTimes(6)
})

it.each(['accept', 'reject', 'resolve'] as const)('runs %s through the actor-bound batch RPC', async (action) => {
  const res = await call({ ...body, action })
  expect(assertWidgetPage).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u' }), 'p', body.pageUrl)
  expect(mutateWidgetFeedbackBatch).toHaveBeenCalledWith({ projectKey: 'p', actorUserId: 'u', pageUrl: body.pageUrl, commentIds: [id], action })
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({ comments: [{ id, body: 'Fix it' }] })
})

it('maps authentication, changed-selection, forbidden, and unknown failures safely', async () => {
  vi.mocked(requireWidgetSession).mockRejectedValueOnce(new WidgetSessionError(401, 'expired'))
  expect((await call()).status).toHaveBeenCalledWith(401)
  for (const [error, status] of [['invalid_selection', 409], ['forbidden', 403]] as const) {
    vi.mocked(mutateWidgetFeedbackBatch).mockRejectedValueOnce(new Error(error))
    expect((await call()).status).toHaveBeenCalledWith(status)
  }
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(mutateWidgetFeedbackBatch).mockRejectedValueOnce(new Error('database'))
  expect((await call()).status).toHaveBeenCalledWith(500)
  vi.mocked(mutateWidgetFeedbackBatch).mockRejectedValueOnce('database')
  expect((await call()).status).toHaveBeenCalledWith(500)
  expect(spy).toHaveBeenCalled(); spy.mockRestore()
})

const secondId = '22222222-2222-4222-8222-222222222222'
it.each(['accept', 'reject', 'resolve'] as const)('fans out committed %s actions to every selected comment and active share', async (action) => {
  const changed = [id, secondId].map((id) => ({ id, updatedAt: '2026-10-08T00:00:00Z', reviewStatus: action === 'reject' ? 'rejected' : 'accepted', implementationStatus: action === 'resolve' ? 'done' : 'unassigned' }))
  vi.mocked(mutateWidgetFeedbackBatch).mockResolvedValue(changed as never)
  vi.mocked(findActiveSharesForComment).mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never)
  vi.mocked(closeLinkedExternalWork).mockRejectedValue(new Error('provider unavailable'))
  const res = await call({ ...body, action, commentIds: [id, secondId] })
  expect(res.status).toHaveBeenCalledWith(200)
  expect(createFeedbackEvent).toHaveBeenCalledTimes(4)
  for (const comment of changed) for (const shareId of ['s1', 's2']) {
    expect(createFeedbackEvent).toHaveBeenCalledWith({ shareId, commentId: comment.id, actorType: 'reviewer', actorId: 'reviewer', eventType: action === 'resolve' ? 'comment.implementation_changed' : 'comment.reviewed', payload: action === 'resolve' ? { implementationStatus: 'done' } : { reviewStatus: comment.reviewStatus } })
  }
  if (action === 'reject') {
    expect(waitUntil).toHaveBeenCalledTimes(2)
    for (const comment of changed) expect(closeLinkedExternalWork).toHaveBeenCalledWith('p', comment.id, comment.updatedAt)
    await Promise.all(vi.mocked(waitUntil).mock.calls.map(([task]) => task))
  } else expect(closeLinkedExternalWork).not.toHaveBeenCalled()
})
it('does not send lifecycle events or close integrations when the batch rolls back', async () => {
  vi.mocked(mutateWidgetFeedbackBatch).mockRejectedValue(new Error('invalid_selection'))
  expect((await call({ ...body, action: 'reject' })).status).toHaveBeenCalledWith(409)
  expect(findActiveSharesForComment).not.toHaveBeenCalled()
  expect(createFeedbackEvent).not.toHaveBeenCalled()
  expect(closeLinkedExternalWork).not.toHaveBeenCalled()
})
