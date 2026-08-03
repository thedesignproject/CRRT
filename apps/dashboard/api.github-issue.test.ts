import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCommentGithubIssue,
  getProjectGitHubStatus,
  updateImplementationStatus,
} from './api'

afterEach(() => vi.unstubAllGlobals())

describe('createCommentGithubIssue', () => {
  it('posts to the encoded comment endpoint with session authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      issueNumber: 42,
      issueUrl: 'https://github.com/acme/site/issues/42',
      createdAt: '2026-07-23T12:00:00Z',
      created: true,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createCommentGithubIssue('/api', 'session', 'comment/1'))
      .resolves.toMatchObject({ issueNumber: 42, created: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/comments/comment%2F1/github-issue',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer session' },
      }),
    )
  })

  it('reads only the project GitHub connection status without caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      githubConnectionStatus: 'connected',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectGitHubStatus('/api', 'session', 'project/1')).resolves.toEqual({
      githubConnectionStatus: 'connected',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/projects/project%2F1/repo-config?view=status',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer session' },
      }),
    )
  })

  it('updates implementation status with session authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'comment-1',
      implementationStatus: 'done',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateImplementationStatus('/api', 'session', 'comment/1', 'done'))
      .resolves.toMatchObject({ implementationStatus: 'done' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/comments/comment%2F1/implementation-status',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ implementationStatus: 'done' }),
      }),
    )
  })
})
