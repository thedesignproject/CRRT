import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireProjectCapability: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/extension-comments.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../_lib/extension-comments.js')>()
  return { ...actual, bulkAssignExtensionCommentsToProject: vi.fn(), bulkDeleteExtensionComments: vi.fn() }
})

import handler from './bulk.js'
import { requireProjectCapability, requireUser } from '../../../_lib/auth.js'
import {
  bulkAssignExtensionCommentsToProject,
  bulkDeleteExtensionComments,
  ExtensionCommentError,
} from '../../../_lib/extension-comments.js'

const id = '00000000-0000-4000-8000-000000000001'
const selection = { mode: 'ids' as const, ids: [id] }
const result = { processedIds: [id], skipped: [], selectedTotal: 1 }
const res = () => ({ statusCode: 200, body: null as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this }, end() { return this }, setHeader(k: string, v: string) { this.headers[k] = v } })
const call = (req: unknown, response: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(req, response)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(requireProjectCapability).mockReset().mockResolvedValue({ role: 'member' })
  vi.mocked(bulkAssignExtensionCommentsToProject).mockReset().mockResolvedValue(result)
  vi.mocked(bulkDeleteExtensionComments).mockReset().mockResolvedValue(result)
})

describe('extension comments bulk endpoint', () => {
  it('handles preflight, method, and authentication gates', async () => {
    let response = res(); await call({ method: 'OPTIONS', headers: {} }, response); expect(response.statusCode).toBe(204)
    response = res(); await call({ method: 'GET', headers: {} }, response); expect(response.statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValue(null)
    response = res(); await call({ method: 'POST', headers: {}, body: {} }, response)
    expect(bulkDeleteExtensionComments).not.toHaveBeenCalled()
  })

  it('deletes the authenticated user selection', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    const response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'delete', selection } }, response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual(result)
    expect(bulkDeleteExtensionComments).toHaveBeenCalledWith('u', selection)
  })

  it('assigns through the destination capability and visibility policy', async () => {
    const user = { userId: 'u', email: 'u@example.com' }
    vi.mocked(requireUser).mockResolvedValue(user)
    let response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'assign', selection, projectId: ' project ', visibility: 'internal' } }, response)
    expect(requireProjectCapability).toHaveBeenCalledWith(expect.anything(), response, user, 'project', 'feedback:create')
    expect(bulkAssignExtensionCommentsToProject).toHaveBeenCalledWith('u', selection, 'project', 'internal')

    vi.mocked(requireProjectCapability).mockResolvedValueOnce({ role: 'guest' })
    response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'assign', selection, projectId: 'project', visibility: 'internal' } }, response)
    expect(bulkAssignExtensionCommentsToProject).toHaveBeenLastCalledWith('u', selection, 'project', 'shared')

    vi.mocked(requireProjectCapability).mockResolvedValueOnce(null)
    response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'assign', selection, projectId: 'blocked' } }, response)
    expect(bulkAssignExtensionCommentsToProject).not.toHaveBeenCalledWith('u', selection, 'blocked', expect.anything())
  })

  it('rejects invalid operations, destinations, visibility, and selections', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    for (const body of [
      { operation: 'other', selection },
      { operation: 'assign', selection, projectId: '' },
      { operation: 'assign', selection, projectId: 42 },
      { operation: 'assign', selection, projectId: 'project', visibility: 'secret' },
      { operation: 'delete', selection: null },
    ]) {
      const response = res()
      await call({ method: 'POST', headers: {}, body }, response)
      expect(response.statusCode).toBe(400)
    }
  })

  it('returns expected and unexpected failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(bulkDeleteExtensionComments)
      .mockRejectedValueOnce(new ExtensionCommentError(409, 'stale'))
      .mockRejectedValueOnce(new Error('down'))
    let response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'delete', selection } }, response)
    expect(response.statusCode).toBe(409)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    response = res()
    await call({ method: 'POST', headers: {}, body: { operation: 'delete', selection } }, response)
    expect(response.statusCode).toBe(500)
    spy.mockRestore()
  })
})

it('defaults assignment visibility to shared', async () => {
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
  const response = res()
  await call({ method: 'POST', headers: {}, body: { operation: 'assign', selection, projectId: 'project' } }, response)
  expect(bulkAssignExtensionCommentsToProject).toHaveBeenCalledWith('u', selection, 'project', 'shared')
})
it('opts in to committed move versions',async()=>{
 vi.mocked(requireUser).mockResolvedValue({userId:'u',email:'u@x.test'})
 const response=res();await call({method:'POST',headers:{},body:{operation:'assign',selection,projectId:'p',captureUndo:true}},response)
 expect(bulkAssignExtensionCommentsToProject).toHaveBeenCalledWith('u',selection,'p','shared',true)
})
