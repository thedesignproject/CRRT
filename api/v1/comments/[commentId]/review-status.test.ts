import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

vi.mock('../../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
  requireProjectCommentCapability: vi.fn(),
}))
vi.mock('../../../_lib/store.js', () => ({
  createFeedbackEvent: vi.fn(),
  findActiveSharesForComment: vi.fn(),
  getComment: vi.fn(),
  mutateProjectFeedback: vi.fn(),
}))
vi.mock('../../../_lib/external-work-sync.js', () => ({ closeLinkedExternalWork: vi.fn() }))

import handler from './review-status.js'
import { waitUntil } from '@vercel/functions'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import {
  createFeedbackEvent,
  findActiveSharesForComment,
  getComment,
  mutateProjectFeedback,
} from '../../../_lib/store.js'
import { closeLinkedExternalWork } from '../../../_lib/external-work-sync.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(requireProjectCommentCapability).mockReset()
  vi.mocked(getComment).mockReset()
  vi.mocked(mutateProjectFeedback).mockReset()
  vi.mocked(findActiveSharesForComment).mockReset()
  vi.mocked(createFeedbackEvent).mockReset()
  vi.mocked(closeLinkedExternalWork).mockReset()
  vi.mocked(closeLinkedExternalWork).mockResolvedValue(undefined)
  vi.mocked(waitUntil).mockReset()
})

describe('api/v1/comments/[commentId]/review-status', () => {
  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates body + comment lookup + membership', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    // missing commentId
    let res = mockRes()
    await call({ method: 'PATCH', query: {}, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // invalid reviewStatus
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'bogus' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    // comment not found
    vi.mocked(getComment).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // comment with null projectId
    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: null } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    // not a member
    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: 'p' } as never)
    vi.mocked(requireProjectCommentCapability).mockImplementationOnce(async (_q, r) => {
      r.status(403).json({ error: 'Forbidden' })
      return null
    })
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('updates review status and emits events; returns 500 on store throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getComment).mockResolvedValue({ id: 'c', projectId: 'p' } as never)
    vi.mocked(requireProjectCommentCapability).mockResolvedValue({ role: 'member' })
    vi.mocked(mutateProjectFeedback).mockResolvedValueOnce({ id: 'c' } as never)
    vi.mocked(findActiveSharesForComment).mockResolvedValueOnce([{ id: 's1' }] as never)

    let res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(mutateProjectFeedback).toHaveBeenCalledWith('p', 'u', 'c', { reviewStatus: 'accepted' })
    expect(createFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'comment.reviewed' }))

    vi.mocked(mutateProjectFeedback).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'accepted' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  it('schedules linked external-work closure for every rejection attempt', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(requireProjectCommentCapability).mockResolvedValue({ role: 'member' })
    vi.mocked(findActiveSharesForComment).mockResolvedValue([])
    vi.mocked(mutateProjectFeedback).mockResolvedValue({ id: 'c', updatedAt: 'version-1' } as never)

    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: 'p', reviewStatus: 'open' } as never)
    let res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'rejected' }, headers: {} }, res)
    expect(closeLinkedExternalWork).toHaveBeenCalledWith('p', 'c', 'version-1')
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))

    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: 'p', reviewStatus: 'rejected' } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { reviewStatus: 'rejected' }, headers: {} }, res)
    expect(closeLinkedExternalWork).toHaveBeenCalledTimes(2)
  })
})

it('rejects a human mutation when access is revoked after the initial precheck',async()=>{
  vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test'})
  vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'member'})
  vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
  vi.mocked(mutateProjectFeedback).mockRejectedValueOnce(new Error('forbidden'))
  const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'rejected'},headers:{}},res)
  expect(res.statusCode).toBe(403)
  expect(res.body).not.toHaveProperty('body')
})

it('returns 404 if the comment is removed before the atomic mutation',async()=>{
  vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test'})
  vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'member'})
  vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
  vi.mocked(mutateProjectFeedback).mockResolvedValueOnce(null)
  vi.mocked(findActiveSharesForComment).mockResolvedValue([])
  const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'rejected'},headers:{}},res)
  expect(res.statusCode).toBe(404)
})
