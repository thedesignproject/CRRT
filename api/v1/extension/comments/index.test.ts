import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/auth.js', () => ({ requireProjectMembership: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/extension-comments.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../_lib/extension-comments.js')>()
  return { ...actual, createExtensionComment: vi.fn(), listExtensionComments: vi.fn() }
})
import handler from './index.js'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { createExtensionComment, ExtensionCommentError, listExtensionComments } from '../../../_lib/extension-comments.js'

const res = () => ({ statusCode: 200, body: null as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this }, end() { return this }, setHeader(k: string, v: string) { this.headers[k] = v } })
const call = (req: unknown, response: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(req, response)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(requireProjectMembership).mockReset().mockResolvedValue(true)
  vi.mocked(createExtensionComment).mockReset()
  vi.mocked(listExtensionComments).mockReset()
})

describe('extension comments collection endpoint', () => {
  it('handles preflight, method, and authentication gates', async () => {
    let response = res(); await call({ method: 'OPTIONS', headers: {} }, response); expect(response.statusCode).toBe(204)
    response = res(); await call({ method: 'DELETE', headers: {} }, response); expect(response.statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValue(null)
    response = res(); await call({ method: 'GET', headers: {} }, response); expect(listExtensionComments).not.toHaveBeenCalled()
  })
  it('lists and creates comments', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(listExtensionComments).mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 })
    let response = res(); await call({ method: 'GET', query: {}, headers: {} }, response); expect(response.statusCode).toBe(200)
    vi.mocked(createExtensionComment).mockResolvedValue({ id: 'c' } as never)
    response = res(); await call({ method: 'POST', body: undefined, headers: {} }, response); expect(response.statusCode).toBe(201); expect(createExtensionComment).toHaveBeenCalledWith('u', {}, null, 'u@example.com')
  })
  it('requires project membership before listing or creating project feedback', async () => {
    const user = { userId: 'u', email: 'u@example.com' }
    vi.mocked(requireUser).mockResolvedValue(user)
    vi.mocked(listExtensionComments).mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 })
    vi.mocked(createExtensionComment).mockResolvedValue({ id: 'c' } as never)

    let response = res()
    await call({ method: 'GET', query: { projectId: 'project' }, headers: {} }, response)
    expect(requireProjectMembership).toHaveBeenCalledWith(expect.anything(), response, user, 'project')
    expect(listExtensionComments).toHaveBeenCalledWith('u', expect.objectContaining({ projectId: 'project' }))

    response = res()
    await call({ method: 'POST', body: { projectId: 'project' }, headers: {} }, response)
    expect(createExtensionComment).toHaveBeenCalledWith('u', { projectId: 'project' }, 'project', 'u@example.com')

    vi.mocked(requireProjectMembership).mockResolvedValueOnce(false)
    response = res()
    await call({ method: 'POST', body: { projectId: 'private-project' }, headers: {} }, response)
    expect(createExtensionComment).not.toHaveBeenCalledWith('u', expect.anything(), 'private-project', expect.anything())

    response = res()
    await call({ method: 'POST', body: { projectId: 42 }, headers: {} }, response)
    expect(response.statusCode).toBe(400)
  })
  it('returns expected and unexpected failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(listExtensionComments).mockRejectedValueOnce(new ExtensionCommentError(400, 'bad')).mockRejectedValueOnce(new Error('down'))
    let response = res(); await call({ method: 'GET', query: {}, headers: {} }, response); expect(response.statusCode).toBe(400)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    response = res(); await call({ method: 'GET', query: {}, headers: {} }, response); expect(response.statusCode).toBe(500); spy.mockRestore()
  })
})
