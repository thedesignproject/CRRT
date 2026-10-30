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

it('handles a non-Error storage failure without exposing the thrown value',async()=>{
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test'})
 vi.mocked(getComment).mockRejectedValueOnce('opaque failure')
 const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'accepted'},headers:{}},res)
 expect(res.statusCode).toBe(500);expect(res.body).toEqual({error:'Unexpected error'})
})

it.each([null, 123, '', 'not-a-date', '2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z', '1900-02-29T12:00:00Z', '2026-04-31T12:00:00Z'])('rejects invalid expected version %s before mutation', async (expectedUpdatedAt) => {
 vi.mocked(requireUser).mockResolvedValue({ userId:'u',email:'u@test.local' })
 const res=mockRes()
 await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'open',expectedUpdatedAt},headers:{}},res)
 expect(res.statusCode).toBe(400)
 expect(mutateProjectFeedback).not.toHaveBeenCalled()
})
it.each(['2024-02-29T12:00:00.123456Z', '2000-02-29T12:00:00.123456+00:00', '2026-10-29T12:00:00.123456+05:30'])('preserves valid calendar timestamp precision and offset: %s', async (expectedUpdatedAt) => {
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test.local'})
 vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'admin'} as never)
 vi.mocked(mutateProjectFeedback).mockResolvedValue({id:'c'} as never)
 vi.mocked(findActiveSharesForComment).mockResolvedValue([])
 const res=mockRes()
 await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'open',expectedUpdatedAt},headers:{}},res)
 expect(res.statusCode).toBe(200)
 expect(mutateProjectFeedback).toHaveBeenCalledWith('p','u','c',{reviewStatus:'open',expectedUpdatedAt})
})
it('forwards the exact version and returns a conflict without publishing activity', async () => {
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test.local'})
 vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'admin'} as never)
 vi.mocked(mutateProjectFeedback).mockRejectedValue(new Error('status_conflict'))
 const res=mockRes(), version='2026-10-29T12:00:00.123456Z'
 await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'open',expectedUpdatedAt:version},headers:{}},res)
 expect(mutateProjectFeedback).toHaveBeenCalledWith('p','u','c',{reviewStatus:'open',expectedUpdatedAt:version})
 expect(res.statusCode).toBe(409)
 expect(createFeedbackEvent).not.toHaveBeenCalled()
 expect(closeLinkedExternalWork).not.toHaveBeenCalled()
})


it.each(['done', 'unassigned', 'claimed', 'in_progress', 'blocked', 'ready_for_testing'] as const)('mutates review and %s implementation together under one version fence', async (implementationStatus) => {
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test.local'})
 vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p'} as never)
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'admin'} as never)
 vi.mocked(mutateProjectFeedback).mockResolvedValue({id:'c',updatedAt:'new'} as never)
 vi.mocked(findActiveSharesForComment).mockResolvedValue([{id:'s'}] as never)
 const res=mockRes(), expectedUpdatedAt='2026-10-30T12:00:00.123456Z'
 await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'accepted',implementationStatus,expectedUpdatedAt},headers:{}},res)
 expect(res.statusCode).toBe(200)
 expect(mutateProjectFeedback).toHaveBeenCalledExactlyOnceWith('p','u','c',{reviewStatus:'accepted',expectedUpdatedAt,implementationStatus,...(implementationStatus==='unassigned'?{claimedByAgentId:null}:{})})
 expect(createFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({eventType:'comment.reviewed',payload:{reviewStatus:'accepted'}}))
 expect(createFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({eventType:'comment.implementation_changed',payload:{implementationStatus}}))
})
it.each([{implementationStatus:'done'}, {implementationStatus:'invalid',expectedUpdatedAt:'2026-10-30T12:00:00Z'}, {implementationStatus:null,expectedUpdatedAt:'2026-10-30T12:00:00Z'}])('rejects an invalid or unfenced combined mutation %j', async (body) => {
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@test.local'})
 const res=mockRes()
 await call({method:'PATCH',query:{commentId:'c'},body:{reviewStatus:'accepted',...body},headers:{}},res)
 expect(res.statusCode).toBe(400)
 expect(mutateProjectFeedback).not.toHaveBeenCalled()
})

it('issues a bound receipt and restores a released agent claim atomically without closing external work', async () => {
 vi.stubEnv('WIDGET_AUTH_SECRET','receipt-test')
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'})
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'owner'} as never)
 const before={id:'c',projectId:'p',reviewStatus:'rejected',implementationStatus:'in_progress',claimedByAgentId:'agent',updatedAt:'2026-10-30T12:00:00Z'}
 const after={...before,reviewStatus:'open',implementationStatus:'unassigned',claimedByAgentId:null,updatedAt:'2026-10-30T12:01:00.123456Z'}
 vi.mocked(getComment).mockResolvedValue(before as never)
 vi.mocked(mutateProjectFeedback).mockResolvedValue(after as never)
 vi.mocked(findActiveSharesForComment).mockResolvedValue([])
 const res=mockRes()
 await call({method:'PATCH',query:{commentId:'c'},headers:{},body:{reviewStatus:'open',implementationStatus:'unassigned',expectedUpdatedAt:before.updatedAt,captureUndo:true}},res)
 expect(res.statusCode).toBe(200)
 const undoToken=(res.body as {undoToken:string}).undoToken
 expect(undoToken).toBeTruthy()
 vi.mocked(getComment).mockResolvedValue(after as never)
 const restored=mockRes()
 await call({method:'PATCH',query:{commentId:'c'},headers:{},body:{undoToken}},restored)
 expect(restored.statusCode).toBe(200)
 expect(mutateProjectFeedback).toHaveBeenLastCalledWith('p','u','c',{reviewStatus:'rejected',implementationStatus:'in_progress',claimedByAgentId:'agent',expectedUpdatedAt:after.updatedAt})
 expect(closeLinkedExternalWork).not.toHaveBeenCalled()
 vi.unstubAllEnvs()
})
it.each([
 [{captureUndo:true,reviewStatus:'open'},400],
 [{captureUndo:true,reviewStatus:'rejected',expectedUpdatedAt:'2026-10-30T12:00:00Z'},400],
 [{captureUndo:true,reviewStatus:'open',expectedUpdatedAt:'2026-10-30T12:00:01Z'},409],
 [{undoToken:'forged'},400],
])('rejects unsafe undo requests %j',async(body,status)=>{
 vi.stubEnv('WIDGET_AUTH_SECRET','receipt-test')
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'})
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'owner'} as never)
 vi.mocked(getComment).mockResolvedValue({id:'c',projectId:'p',updatedAt:'2026-10-30T12:00:00Z'} as never)
 const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},headers:{},body},res)
 expect(res.statusCode).toBe(status);expect(mutateProjectFeedback).not.toHaveBeenCalled();vi.unstubAllEnvs()
})
it('does not resolve an Undo against a missing comment',async()=>{
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'})
 const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},headers:{},body:{undoToken:'x'}},res)
 expect(res.statusCode).toBe(404)
})
it('preserves external tickets for an explicit reversible rejection',async()=>{
 vi.stubEnv('WIDGET_AUTH_SECRET','receipt-test')
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'})
 vi.mocked(requireProjectCommentCapability).mockResolvedValue({role:'owner'} as never)
 const before={id:'c',projectId:'p',reviewStatus:'open',implementationStatus:'unassigned',claimedByAgentId:null,updatedAt:'2026-10-30T12:00:00Z'}
 vi.mocked(getComment).mockResolvedValue(before as never);vi.mocked(mutateProjectFeedback).mockResolvedValue({...before,reviewStatus:'rejected'} as never)
 vi.mocked(findActiveSharesForComment).mockResolvedValue([])
 const res=mockRes();await call({method:'PATCH',query:{commentId:'c'},headers:{},body:{reviewStatus:'rejected',expectedUpdatedAt:before.updatedAt,captureUndo:true,preserveExternalWork:true}},res)
 expect(res.statusCode).toBe(200);expect(closeLinkedExternalWork).not.toHaveBeenCalled();vi.unstubAllEnvs()
})
