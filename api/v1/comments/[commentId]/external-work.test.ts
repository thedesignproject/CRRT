import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireProjectCommentCapability: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({ getComment: vi.fn(), getCommentForGithubIssue: vi.fn(), getGithubIssueConnection: vi.fn() }))
vi.mock('./github-issue.js', () => ({ default: vi.fn() }))

import handler from './external-work.js'
import githubIssueHandler from './github-issue.js'
import { requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { getComment, getCommentForGithubIssue, getGithubIssueConnection } from '../../../_lib/store.js'

function response() {
  return { statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this },
    end() { return this }, setHeader(key: string, value: string) { this.headers[key] = value } }
}
const call = (req: unknown, res: unknown) => (handler as unknown as (request: unknown, response: unknown) => Promise<unknown>)(req, res)

const comment = { id: 'c', projectId: 'p', body: 'Move the CTA above the fold', authorName: 'Client', pageUrl: 'https://example.com', imageUrl: null, selector: '#cta', x: 10, y: 20, targetType: 'element_point' as const, anchor: null, reviewStatus: 'accepted', githubIssue: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@example.com' })
  vi.mocked(requireProjectCommentCapability).mockResolvedValue({ role: 'member' })
  vi.mocked(getComment).mockResolvedValue(comment as never)
  vi.mocked(getCommentForGithubIssue).mockResolvedValue(comment as never)
  vi.mocked(getGithubIssueConnection).mockResolvedValue({ owner: 'acme', repo: 'store', installationId: 1, connectionVersion: 'v' } as never)
})

describe('external work endpoint', () => {
  it('prepares a deterministic editable GitHub draft without exposing credentials', async () => {
    const res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ provider: 'github', connected: true, destination: 'acme/store', draft: { title: expect.stringContaining('Move the CTA'), body: expect.stringContaining('Move the CTA') } })
    expect(JSON.stringify(res.body)).not.toContain('installationId')
  })

  it('dispatches sends through the provider adapter and rejects unsupported providers', async () => {
    const req = { method: 'POST', query: { commentId: 'c' }, body: { provider: 'github', draft: { title: 'T', body: 'B' } }, headers: {} }
    const res = response()
    await call(req, res)
    expect(githubIssueHandler).toHaveBeenCalledWith(req, res)

    const unsupported = response()
    await call({ ...req, body: { provider: 'jira' } }, unsupported)
    expect(unsupported.statusCode).toBe(400)
  })

  it('conceals inaccessible feedback', async () => {
    vi.mocked(requireProjectCommentCapability).mockResolvedValueOnce(null)
    const res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.body).toBeNull()
    expect(getCommentForGithubIssue).not.toHaveBeenCalled()
  })
})
