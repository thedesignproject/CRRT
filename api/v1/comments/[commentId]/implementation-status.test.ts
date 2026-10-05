import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import handler from './implementation-status.js'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import {
  createFeedbackEvent,
  findActiveSharesForComment,
  getComment,
  mutateProjectFeedback,
} from '../../../_lib/store.js'

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
})

describe('api/v1/comments/[commentId]/implementation-status', () => {
  it('returns 401 when requireUser rejects', async () => {
    vi.mocked(requireUser).mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('validates body + comment lookup + membership', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })

    let res = mockRes()
    await call({ method: 'PATCH', query: {}, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'bogus' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getComment).mockResolvedValueOnce(null)
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: null } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(getComment).mockResolvedValueOnce({ id: 'c', projectId: 'p' } as never)
    vi.mocked(requireProjectCommentCapability).mockImplementationOnce(async (_q, r) => {
      r.status(403).json({ error: 'Forbidden' })
      return null
    })
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)
  })

  it('updates implementation status and emits events; returns 500 on store throw', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getComment).mockResolvedValue({ id: 'c', projectId: 'p' } as never)
    vi.mocked(requireProjectCommentCapability).mockResolvedValue({ role: 'member' })
    vi.mocked(mutateProjectFeedback).mockResolvedValueOnce({ id: 'c' } as never)
    vi.mocked(findActiveSharesForComment).mockResolvedValueOnce([{ id: 's1' }] as never)

    let res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'ready_for_testing' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(mutateProjectFeedback).toHaveBeenCalledWith('p', 'u', 'c', { implementationStatus: 'ready_for_testing' })
    expect(createFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'comment.implementation_changed',
      payload: { implementationStatus: 'ready_for_testing' },
    }))

    vi.mocked(mutateProjectFeedback).mockRejectedValueOnce(new Error('boom'))
    res = mockRes()
    await call({ method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'claimed' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })

  it('clears the previous agent claim when a reviewer reopens an item', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'a@b.c' })
    vi.mocked(getComment).mockResolvedValue({
      id: 'c', projectId: 'p', implementationStatus: 'done', claimedByAgentId: 'old-agent',
    } as never)
    vi.mocked(requireProjectCommentCapability).mockResolvedValue({ role: 'member' })
    vi.mocked(mutateProjectFeedback).mockResolvedValue({ id: 'c' } as never)
    vi.mocked(findActiveSharesForComment).mockResolvedValue([])
    const res = mockRes()

    await call({
      method: 'PATCH', query: { commentId: 'c' }, body: { implementationStatus: 'unassigned' }, headers: {},
    }, res)

    expect(res.statusCode).toBe(200)
    expect(mutateProjectFeedback).toHaveBeenCalledWith('p', 'u', 'c', {
      implementationStatus: 'unassigned',
      claimedByAgentId: null,
    })
  })
})

it('rejects a human mutation when access is revoked after the initial precheck',async()=>{
  vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test'})
  vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'member'})
  vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
  vi.mocked(mutateProjectFeedback).mockRejectedValueOnce(new Error('forbidden'))
  const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},body:{implementationStatus:'blocked'},headers:{}},res)
  expect(res.statusCode).toBe(403)
  expect(res.body).not.toHaveProperty('body')
})

it('returns 404 if the comment is removed before the atomic mutation',async()=>{
  vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test'})
  vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'member'})
  vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
  vi.mocked(mutateProjectFeedback).mockResolvedValueOnce(null)
  vi.mocked(findActiveSharesForComment).mockResolvedValue([])
  const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},body:{implementationStatus:'blocked'},headers:{}},res)
  expect(res.statusCode).toBe(404)
})
