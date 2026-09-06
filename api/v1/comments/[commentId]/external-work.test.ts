import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({ requireProjectCapability: vi.fn(), requireProjectCommentCapability: vi.fn(), requireUser: vi.fn() }))
vi.mock('../../../_lib/linear-connection.js', () => ({ getLinearAccessToken: vi.fn() }))
vi.mock('../../../_lib/linear.js', () => ({ createLinearIssue: vi.fn() }))
vi.mock('../../../_lib/store.js', () => ({
  claimCommentExternalWork: vi.fn(), finalizeCommentExternalWork: vi.fn(), getComment: vi.fn(), getCommentExternalWork: vi.fn(),
  getCommentForGithubIssue: vi.fn(), getGithubIssueConnection: vi.fn(), getProjectIntegration: vi.fn(), markCommentExternalWorkUncertain: vi.fn(),
  releaseCommentExternalWork: vi.fn(), updateReviewStatus: vi.fn(),
}))
vi.mock('./github-issue.js', () => ({ default: vi.fn() }))

import handler from './external-work.js'
import githubIssueHandler from './github-issue.js'
import { requireProjectCapability, requireProjectCommentCapability, requireUser } from '../../../_lib/auth.js'
import { getLinearAccessToken } from '../../../_lib/linear-connection.js'
import { createLinearIssue } from '../../../_lib/linear.js'
import { claimCommentExternalWork, finalizeCommentExternalWork, getComment, getCommentExternalWork, getCommentForGithubIssue, getGithubIssueConnection, getProjectIntegration, markCommentExternalWorkUncertain } from '../../../_lib/store.js'

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
  vi.mocked(requireProjectCapability).mockResolvedValue({ role: 'member' })
  vi.mocked(getComment).mockResolvedValue(comment as never)
  vi.mocked(getCommentForGithubIssue).mockResolvedValue(comment as never)
  vi.mocked(getGithubIssueConnection).mockResolvedValue({ owner: 'acme', repo: 'store', installationId: 1, connectionVersion: 'v' } as never)
  vi.mocked(getCommentExternalWork).mockResolvedValue(null)
  vi.mocked(getProjectIntegration).mockResolvedValue({ id: 'integration', containerId: 'team', containerName: 'WEB · Web' } as never)
  vi.mocked(getLinearAccessToken).mockResolvedValue('linear-token')
  vi.mocked(claimCommentExternalWork).mockImplementation(async (input) => ({ id: 'work', state: 'creating', leaseToken: input.leaseToken } as never))
  vi.mocked(markCommentExternalWorkUncertain).mockResolvedValue(true)
  vi.mocked(createLinearIssue).mockResolvedValue({ externalId: 'issue', externalKey: 'WEB-1', externalUrl: 'https://linear.app/issue/WEB-1' })
  vi.mocked(finalizeCommentExternalWork).mockResolvedValue({ createdAt: 'now' } as never)
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

  it('validates methods, authentication, identifiers, and comment scope', async () => {
    let res = response()
    await call({ method: 'OPTIONS', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(204)

    res = response()
    await call({ method: 'PATCH', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)

    vi.mocked(requireUser).mockResolvedValueOnce(null)
    res = response()
    await call({ method: 'GET', query: { provider: 'github' }, headers: {} }, res)
    expect(res.body).toBeNull()

    res = response()
    await call({ method: 'GET', query: { provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getComment).mockResolvedValueOnce(null)
    res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(getComment).mockResolvedValueOnce({ ...comment, projectId: null } as never)
    res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)

    vi.mocked(getCommentForGithubIssue).mockResolvedValueOnce(null)
    res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(404)
  })

  it('reports disconnected projects, existing issues, and safe preparation failures', async () => {
    const existing = { issueNumber: 7, issueUrl: 'https://github.com/acme/store/issues/7', createdAt: 'now' }
    vi.mocked(getGithubIssueConnection).mockResolvedValueOnce(null)
    vi.mocked(getCommentForGithubIssue).mockResolvedValueOnce({ ...comment, githubIssue: existing } as never)
    let res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.body).toMatchObject({ connected: false, destination: null, existing })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getComment).mockRejectedValueOnce(new Error('database secret'))
    res = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'github' }, headers: {} }, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Could not prepare external work' })
  })

  it('prepares and durably creates Linear work before accepting feedback', async () => {
    const prepared = response()
    await call({ method: 'GET', query: { commentId: 'c', provider: 'linear' }, headers: {} }, prepared)
    expect(prepared.body).toMatchObject({ provider: 'linear', connected: true, destination: 'WEB · Web' })

    const created = response()
    await call({ method: 'POST', query: { commentId: 'c' }, body: { provider: 'linear', draft: { title: 'Edited', body: 'Details' } }, headers: {} }, created)
    expect(created.statusCode).toBe(201)
    expect(createLinearIssue).toHaveBeenCalledWith('linear-token', { teamId: 'team', title: 'Edited', description: 'Details' })
    expect(finalizeCommentExternalWork).toHaveBeenCalledWith(expect.objectContaining({ externalKey: 'WEB-1' }))
  })
})
