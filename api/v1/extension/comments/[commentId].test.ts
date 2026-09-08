import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../_lib/auth.js', () => ({ requireProjectMembership: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/extension-comments.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../_lib/extension-comments.js')>()
  return { ...actual, deleteExtensionComment: vi.fn(), getOwnedExtensionCommentScope: vi.fn(), updateExtensionComment: vi.fn() }
})
import handler from './[commentId].js'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { deleteExtensionComment, ExtensionCommentError, getOwnedExtensionCommentScope, updateExtensionComment } from '../../../_lib/extension-comments.js'

const res = () => ({ statusCode: 200, body: null as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this }, end() { return this }, setHeader(k: string, v: string) { this.headers[k] = v } })
const call = (req: unknown, response: unknown) => (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(req, response)

beforeEach(() => {
  vi.mocked(requireUser).mockReset()
  vi.mocked(requireProjectMembership).mockReset().mockResolvedValue(true)
  vi.mocked(deleteExtensionComment).mockReset()
  vi.mocked(getOwnedExtensionCommentScope).mockReset().mockResolvedValue({ projectId: null })
  vi.mocked(updateExtensionComment).mockReset()
})

describe('extension comment item endpoint', () => {
  it('handles preflight, method, authentication, and id gates', async () => {
    let response = res(); await call({ method: 'OPTIONS', headers: {} }, response); expect(response.statusCode).toBe(204)
    response = res(); await call({ method: 'GET', headers: {} }, response); expect(response.statusCode).toBe(405)
    vi.mocked(requireUser).mockResolvedValue(null)
    response = res(); await call({ method: 'PATCH', headers: {} }, response); expect(updateExtensionComment).not.toHaveBeenCalled()
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    response = res(); await call({ method: 'PATCH', query: {}, headers: {} }, response); expect(response.statusCode).toBe(400)
  })
  it('updates and deletes comments', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(updateExtensionComment).mockResolvedValue({ id: 'c' } as never)
    let response = res(); await call({ method: 'PATCH', query: { commentId: 'c' }, body: { body: 'x' }, headers: {} }, response); expect(response.statusCode).toBe(200)
    response = res(); await call({ method: 'DELETE', query: { commentId: 'c' }, headers: {} }, response); expect(response.statusCode).toBe(204)
  })
  it('rechecks current access before mutating project comments', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(getOwnedExtensionCommentScope).mockResolvedValue({ projectId: 'project' })
    vi.mocked(requireProjectMembership).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    let response = res(); await call({ method: 'PATCH', query: { commentId: 'c' }, body: { body: 'x' }, headers: {} }, response)
    expect(requireProjectMembership).toHaveBeenCalledWith(expect.anything(), response, { userId: 'u', email: 'u@example.com' }, 'project')
    expect(updateExtensionComment).not.toHaveBeenCalled()

    response = res(); await call({ method: 'DELETE', query: { commentId: 'c' }, headers: {} }, response)
    expect(response.statusCode).toBe(204)
    expect(deleteExtensionComment).toHaveBeenCalledWith('u', 'c')
  })
  it('hides comments outside the caller ownership scope', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(getOwnedExtensionCommentScope).mockResolvedValue(null)
    const response = res(); await call({ method: 'DELETE', query: { commentId: 'c' }, headers: {} }, response)
    expect(response.statusCode).toBe(404)
    expect(deleteExtensionComment).not.toHaveBeenCalled()
  })
  it('returns expected and unexpected failures', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
    vi.mocked(updateExtensionComment).mockRejectedValueOnce(new ExtensionCommentError(404, 'missing')).mockRejectedValueOnce(new Error('down'))
    let response = res(); await call({ method: 'PATCH', query: { commentId: 'c' }, body: {}, headers: {} }, response); expect(response.statusCode).toBe(404)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    response = res(); await call({ method: 'PATCH', query: { commentId: 'c' }, body: {}, headers: {} }, response); expect(response.statusCode).toBe(500); spy.mockRestore()
  })
})
