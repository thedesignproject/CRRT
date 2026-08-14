import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../_lib/auth.js', () => ({
  requireUser: vi.fn(),
  requireProjectMembership: vi.fn(),
}))
vi.mock('../../../_lib/comment-issue-content.js', () => ({ generateCommentIssueContent: vi.fn() }))
vi.mock('../../../_lib/github-app.js', () => ({ createInstallationAccessToken: vi.fn() }))
vi.mock('../../../_lib/github-issues.js', () => ({
  createCommentIssueMarker: vi.fn(),
  createGithubIssue: vi.fn(),
  findGithubIssueByMarker: vi.fn(),
  formatGithubIssueBody: vi.fn(),
}))
vi.mock('../../../_lib/store.js', () => ({
  claimCommentGithubIssue: vi.fn(),
  finalizeCommentGithubIssue: vi.fn(),
  getComment: vi.fn(),
  getCommentForGithubIssue: vi.fn(),
  getGithubIssueConnection: vi.fn(),
  markCommentGithubIssueUncertain: vi.fn(),
  releaseCommentGithubIssue: vi.fn(),
  resetCommentGithubIssueAttempt: vi.fn(),
}))

import handler from './github-issue.js'
import { requireProjectMembership, requireUser } from '../../../_lib/auth.js'
import { generateCommentIssueContent } from '../../../_lib/comment-issue-content.js'
import { createInstallationAccessToken } from '../../../_lib/github-app.js'
import {
  createCommentIssueMarker,
  createGithubIssue,
  findGithubIssueByMarker,
  formatGithubIssueBody,
} from '../../../_lib/github-issues.js'
import {
  claimCommentGithubIssue,
  finalizeCommentGithubIssue,
  getComment,
  getCommentForGithubIssue,
  getGithubIssueConnection,
  markCommentGithubIssueUncertain,
  releaseCommentGithubIssue,
  resetCommentGithubIssueAttempt,
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
const call = (method = 'POST', query: Record<string, unknown> = { commentId: 'comment-1' }) => {
  const res = mockRes()
  return (handler as never as (req: unknown, res: ReturnType<typeof mockRes>) => Promise<unknown>)({
    method, query, headers: {},
  }, res).then(() => res)
}

const issue = {
  issueNumber: 42,
  issueUrl: 'https://github.com/acme/site/issues/42',
  createdAt: '2026-07-23T12:00:00Z',
}
const comment = {
  id: 'comment-1',
  projectId: 'project-1',
  body: 'Increase contrast',
  authorName: 'Ada',
  pageUrl: 'https://example.com',
  imageUrl: null,
  selector: '#hero',
  x: 10,
  y: 20,
  targetType: 'element_point',
  anchor: null,
  reviewStatus: 'accepted',
  githubIssue: null,
  githubIssueLeaseToken: 'lease-token',
  githubIssueUncertainAt: null,
}
const connection = {
  owner: 'acme',
  repo: 'site',
  installationId: '99',
  connectionVersion: 3,
}
const claimedLease = () => {
  const calls = vi.mocked(claimCommentGithubIssue).mock.calls
  return calls[calls.length - 1]?.[2] ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'user-1', email: 'a@b.c' })
  vi.mocked(requireProjectMembership).mockResolvedValue(true)
  vi.mocked(getComment).mockResolvedValue(comment as never)
  vi.mocked(getCommentForGithubIssue).mockImplementation(async () => ({
    ...comment,
    githubIssueLeaseToken: claimedLease(),
  } as never))
  vi.mocked(getGithubIssueConnection).mockResolvedValue(connection)
  vi.mocked(claimCommentGithubIssue).mockResolvedValue(comment as never)
  vi.mocked(createInstallationAccessToken).mockResolvedValue('installation-token')
  vi.mocked(createCommentIssueMarker).mockReturnValue('<!-- marker -->')
  vi.mocked(findGithubIssueByMarker).mockResolvedValue(null)
  vi.mocked(generateCommentIssueContent).mockResolvedValue({
    title: 'Improve contrast',
    summary: 'Summary',
    implementationContext: 'Context',
  })
  vi.mocked(formatGithubIssueBody).mockReturnValue('issue body')
  vi.mocked(createGithubIssue).mockResolvedValue(issue)
  vi.mocked(finalizeCommentGithubIssue).mockResolvedValue(true)
  vi.mocked(markCommentGithubIssueUncertain).mockResolvedValue(true)
  vi.mocked(releaseCommentGithubIssue).mockResolvedValue(true)
  vi.mocked(resetCommentGithubIssueAttempt).mockResolvedValue(true)
})

describe('POST comment GitHub issue', () => {
  it('authenticates, validates the method and comment id', async () => {
    vi.mocked(requireUser).mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    expect((await call()).statusCode).toBe(401)
    expect((await call('GET')).statusCode).toBe(405)
    expect((await call('OPTIONS')).statusCode).toBe(204)
    expect((await call('POST', {})).statusCode).toBe(400)
  })

  it('requires an existing comment and current membership', async () => {
    vi.mocked(getComment).mockResolvedValueOnce(null)
    expect((await call()).statusCode).toBe(404)

    vi.mocked(getComment).mockResolvedValueOnce({ ...comment, projectId: null } as never)
    expect((await call()).statusCode).toBe(404)

    vi.mocked(requireProjectMembership).mockImplementationOnce(async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' })
      return false
    })
    expect((await call()).statusCode).toBe(403)

    vi.mocked(getCommentForGithubIssue).mockResolvedValueOnce(null)
    expect((await call()).statusCode).toBe(404)
  })

  it('returns persisted issues and rejects ineligible or disconnected comments', async () => {
    vi.mocked(getCommentForGithubIssue).mockResolvedValueOnce({ ...comment, githubIssue: issue } as never)
    expect((await call()).body).toEqual({ ...issue, created: false })

    vi.mocked(getCommentForGithubIssue).mockResolvedValueOnce({ ...comment, reviewStatus: 'open' } as never)
    expect((await call()).body).toEqual({ error: 'comment_not_accepted' })

    vi.mocked(getGithubIssueConnection).mockResolvedValueOnce(null)
    expect((await call()).body).toEqual({ error: 'github_repository_not_connected' })
  })

  it('creates and finalizes exactly one issue', async () => {
    const res = await call()
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({ ...issue, created: true })
    expect(createInstallationAccessToken).toHaveBeenCalledWith('99')
    expect(createGithubIssue).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'installation-token',
      owner: 'acme',
      repo: 'site',
      body: 'issue body',
    }))
    expect(finalizeCommentGithubIssue).toHaveBeenCalledWith(
      'project-1',
      'comment-1',
      expect.any(String),
      issue,
    )
  })

  it('recovers a marker match without creating another issue', async () => {
    vi.mocked(findGithubIssueByMarker).mockResolvedValueOnce(issue)
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ...issue, created: false })
    expect(createGithubIssue).not.toHaveBeenCalled()

    vi.mocked(finalizeCommentGithubIssue).mockClear()
    vi.mocked(findGithubIssueByMarker).mockResolvedValueOnce(issue)
    vi.mocked(getGithubIssueConnection)
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce({ ...connection, connectionVersion: 4 })
    expect((await call()).statusCode).toBe(409)
    expect(finalizeCommentGithubIssue).not.toHaveBeenCalled()

    vi.mocked(getGithubIssueConnection).mockResolvedValue(connection)
    vi.mocked(findGithubIssueByMarker).mockResolvedValueOnce(issue)
    vi.mocked(requireProjectMembership)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async (_req, response) => {
        response.status(403).json({ error: 'Forbidden' })
        return false
      })
    expect((await call()).statusCode).toBe(403)
    expect(finalizeCommentGithubIssue).not.toHaveBeenCalled()

    vi.mocked(releaseCommentGithubIssue).mockClear()
    vi.mocked(findGithubIssueByMarker).mockResolvedValueOnce(issue)
    vi.mocked(finalizeCommentGithubIssue).mockResolvedValue(false)
    expect((await call()).statusCode).toBe(500)
    expect(releaseCommentGithubIssue).toHaveBeenCalled()
  })

  it('never posts again while an uncertain result awaits marker recovery', async () => {
    vi.mocked(getCommentForGithubIssue)
      .mockResolvedValueOnce({ ...comment, githubIssueUncertainAt: '2026-07-23T12:00:00Z' } as never)
    const res = await call()
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'github_issue_recovery_pending' })
    expect(claimCommentGithubIssue).toHaveBeenCalledWith(
      'project-1',
      'comment-1',
      expect.any(String),
      undefined,
      true,
    )
    expect(createGithubIssue).not.toHaveBeenCalled()
  })

  it('returns an existing issue or active-lease conflict when claim loses', async () => {
    vi.mocked(claimCommentGithubIssue).mockResolvedValue(null)
    vi.mocked(getCommentForGithubIssue)
      .mockResolvedValueOnce(comment as never)
      .mockResolvedValueOnce({ ...comment, githubIssue: issue } as never)
    expect((await call()).statusCode).toBe(200)

    vi.mocked(claimCommentGithubIssue).mockResolvedValue(null)
    vi.mocked(getCommentForGithubIssue)
      .mockResolvedValueOnce(comment as never)
      .mockResolvedValueOnce(comment as never)
    const conflict = await call()
    expect(conflict.statusCode).toBe(409)
    expect(conflict.body).toEqual({ error: 'github_issue_creation_in_progress' })

    vi.mocked(claimCommentGithubIssue).mockResolvedValue(null)
    vi.mocked(getCommentForGithubIssue)
      .mockResolvedValueOnce(comment as never)
      .mockResolvedValueOnce(null)
    expect((await call()).statusCode).toBe(404)
  })

  it('releases before creation when state, connection, or membership changes', async () => {
    vi.mocked(getCommentForGithubIssue)
      .mockResolvedValueOnce(comment as never)
      .mockResolvedValueOnce({ ...comment, reviewStatus: 'rejected' } as never)
    expect((await call()).statusCode).toBe(409)
    expect(releaseCommentGithubIssue).toHaveBeenCalled()

    vi.mocked(getCommentForGithubIssue).mockImplementation(async () => ({
      ...comment,
      githubIssueLeaseToken: claimedLease(),
    } as never))
    vi.mocked(getGithubIssueConnection)
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce({ ...connection, connectionVersion: 4 })
    expect((await call()).statusCode).toBe(409)

    vi.mocked(getGithubIssueConnection).mockResolvedValue(connection)
    vi.mocked(requireProjectMembership)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async (_req, res) => {
        res.status(403).json({ error: 'Forbidden' })
        return false
      })
    expect((await call()).statusCode).toBe(403)
  })

  it('resets deterministic failures and preserves uncertain outcomes for recovery', async () => {
    vi.mocked(createGithubIssue).mockRejectedValueOnce(new Error('github_issue_create_failed'))
    const githubFailure = await call()
    expect(githubFailure.statusCode).toBe(502)
    expect(githubFailure.body).toEqual({ error: 'GitHub issue creation failed' })
    expect(resetCommentGithubIssueAttempt).toHaveBeenCalled()

    vi.mocked(releaseCommentGithubIssue).mockClear()
    vi.mocked(finalizeCommentGithubIssue).mockResolvedValue(false)
    const persistenceFailure = await call()
    expect(persistenceFailure.statusCode).toBe(500)
    expect(releaseCommentGithubIssue).toHaveBeenCalled()

    vi.mocked(releaseCommentGithubIssue).mockClear()
    vi.mocked(finalizeCommentGithubIssue).mockResolvedValue(true)
    vi.mocked(resetCommentGithubIssueAttempt).mockClear()
    vi.mocked(createGithubIssue)
      .mockRejectedValueOnce(new Error('github_issue_result_indeterminate'))
    expect((await call()).statusCode).toBe(502)
    expect(resetCommentGithubIssueAttempt).not.toHaveBeenCalled()
    expect(releaseCommentGithubIssue).toHaveBeenCalled()

    vi.mocked(releaseCommentGithubIssue).mockClear()
    vi.mocked(createGithubIssue).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(releaseCommentGithubIssue).mockRejectedValueOnce(new Error('database secret'))
    expect((await call()).body).toEqual({ error: 'Issue creation failed' })

    vi.mocked(createGithubIssue).mockRejectedValueOnce('non-error failure')
    expect((await call()).statusCode).toBe(500)
  })

  it('does not post unless the database marks the attempt uncertain', async () => {
    vi.mocked(markCommentGithubIssueUncertain).mockResolvedValueOnce(false)
    expect((await call()).statusCode).toBe(502)
    expect(createGithubIssue).not.toHaveBeenCalled()
    expect(releaseCommentGithubIssue).toHaveBeenCalled()
  })

  it('maps non-error failures without leaking details', async () => {
    vi.mocked(createInstallationAccessToken).mockRejectedValueOnce('private value')
    expect((await call()).body).toEqual({ error: 'Issue creation failed' })
  })

  it('retries finalization once after a transient database error', async () => {
    vi.mocked(finalizeCommentGithubIssue)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(true)
    expect((await call()).statusCode).toBe(201)
    expect(finalizeCommentGithubIssue).toHaveBeenCalledTimes(2)
  })
})
