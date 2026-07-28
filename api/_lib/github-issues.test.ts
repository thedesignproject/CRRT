import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCommentIssueMarker,
  createGithubIssue,
  findGithubIssueByMarker,
  formatGithubIssueBody,
} from './github-issues.js'

const originalSecret = process.env.WIDGET_AUTH_SECRET
const fetchMock = vi.fn()

beforeEach(() => {
  process.env.WIDGET_AUTH_SECRET = 'test-secret'
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  process.env.WIDGET_AUTH_SECRET = originalSecret
  vi.unstubAllGlobals()
})

const comment = {
  id: 'comment-1',
  body: 'Increase contrast',
  authorName: 'Ada',
  pageUrl: 'https://example.com/page?mode=dark',
  imageUrl: 'https://cdn.example.com/screenshot.png',
  selector: '#hero',
  x: 10,
  y: 20,
  targetType: 'text_range' as const,
  anchor: {
    selectedText: 'Read more',
    prefix: 'Click ',
    suffix: ' today',
    containerSelector: '#hero p',
    startOffset: 6,
    endOffset: 15,
    rangeClientRects: [{ left: 1, top: 2, width: 3, height: 4 }],
    createdAtViewport: { width: 1200, height: 800, scrollX: 0, scrollY: 50 },
  },
}
const content = {
  title: 'Improve hero contrast',
  summary: 'The hero call to action needs stronger contrast.',
  implementationContext: 'Review foreground and background tokens in the hero.',
}

describe('GitHub issue formatting', () => {
  it('creates a stable signed marker and complete Markdown', () => {
    const marker = createCommentIssueMarker(comment.id)
    expect(createCommentIssueMarker(comment.id)).toBe(marker)
    const body = formatGithubIssueBody(comment, content, marker)
    for (const value of [
      '## Summary', content.summary, '## Feedback', '— Ada', '## Screenshot',
      '## Page', '## Selected element', 'Selector: `#hero`', 'Coordinates: 10, 20',
      'Selected text: Read more', 'Start offset: 6', 'Client rectangles:',
      '## Implementation context', marker,
    ]) expect(body).toContain(value)
  })

  it('omits unavailable optional context', () => {
    const body = formatGithubIssueBody({
      ...comment,
      authorName: null,
      pageUrl: '',
      imageUrl: 'file:///secret.png',
      selector: '',
      x: Number.NaN,
      y: Number.NaN,
      targetType: '' as never,
      anchor: null,
    }, content, '<!-- marker -->')
    expect(body).not.toContain('## Screenshot')
    expect(body).not.toContain('## Page')
    expect(body).not.toContain('## Selected element')
    expect(body).not.toContain('— ')
  })

  it('rejects malformed URLs and missing marker configuration', () => {
    const body = formatGithubIssueBody({
      ...comment,
      pageUrl: 'not a URL',
      imageUrl: 'not a URL',
      anchor: null,
    }, content, '<!-- marker -->')
    expect(body).not.toContain('## Page')
    expect(body).toContain('Target type: text_range')
    delete process.env.WIDGET_AUTH_SECRET
    expect(() => createCommentIssueMarker(comment.id)).toThrow('missing_widget_auth_secret')
  })

  it('formats only present anchor values', () => {
    const body = formatGithubIssueBody({
      ...comment,
      anchor: { selectedText: '', prefix: null, startOffset: 0 },
    }, content, '<!-- marker -->')
    expect(body).toContain('Start offset: 0')
    expect(body).not.toContain('Selected text:')
    expect(body).not.toContain('Prefix:')
    expect(body).not.toContain('Suffix:')
  })
})

describe('GitHub issue requests', () => {
  it('recovers an exact marker match and returns null without one', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{
        number: 42,
        html_url: 'https://github.com/acme/site/issues/42',
        created_at: '2026-07-23T12:00:00Z',
        body: 'body <!-- marker -->',
      }],
    }), { status: 200 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'token',
      owner: 'acme',
      repo: 'site',
      marker: '<!-- marker -->',
    })).resolves.toMatchObject({ issueNumber: 42 })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token')

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'token', owner: 'acme', repo: 'site', marker: '<!-- none -->',
    })).resolves.toBeNull()
  })

  it('rejects ambiguous copied recovery markers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [
        { body: '<!-- marker -->', number: 1 },
        { body: 'copied <!-- marker -->', number: 2 },
      ],
    }), { status: 200 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'token', owner: 'acme', repo: 'site', marker: '<!-- marker -->',
    })).rejects.toThrow('github_issue_recovery_ambiguous')
  })

  it('creates an issue and validates GitHub responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      number: 7,
      html_url: 'https://github.com/acme/site/issues/7',
      created_at: '2026-07-23T12:00:00Z',
    }), { status: 201 }))
    await expect(createGithubIssue({
      accessToken: 'token', owner: 'acme', repo: 'site', title: 'Title', body: 'Body',
    })).resolves.toMatchObject({ issueNumber: 7 })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 'Title', body: 'Body' })

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 422 }))
    await expect(createGithubIssue({
      accessToken: 'secret', owner: 'acme', repo: 'site', title: 'Title', body: 'Body',
    })).rejects.toThrow('github_issue_create_failed')

    await expect(createGithubIssue({
      accessToken: 'secret',
      owner: 'acme',
      repo: 'site',
      title: 'Title',
      body: 'x'.repeat(65_537),
    })).rejects.toThrow('github_issue_content_too_large')
  })

  it('maps search, indeterminate responses, and network failures safely', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'secret', owner: 'acme', repo: 'site', marker: 'marker',
    })).rejects.toThrow('github_issue_search_failed')

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 200 }))
    await expect(createGithubIssue({
      accessToken: 'secret', owner: 'acme', repo: 'site', title: 'Title', body: 'Body',
    })).rejects.toThrow('github_issue_result_indeterminate')

    fetchMock.mockRejectedValueOnce(new Error('includes secret'))
    await expect(createGithubIssue({
      accessToken: 'secret', owner: 'acme', repo: 'site', title: 'Title', body: 'Body',
    })).rejects.toThrow('github_issue_result_indeterminate')

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }))
    await expect(createGithubIssue({
      accessToken: 'secret', owner: 'acme', repo: 'site', title: 'Title', body: 'Body',
    })).rejects.toThrow('github_issue_result_indeterminate')

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 200 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'secret', owner: 'acme', repo: 'site', marker: 'marker',
    })).rejects.toThrow('github_issue_request_failed')

    fetchMock.mockRejectedValueOnce(new Error('includes secret'))
    await expect(findGithubIssueByMarker({
      accessToken: 'secret', owner: 'acme', repo: 'site', marker: 'marker',
    })).rejects.toThrow('github_issue_request_failed')
  })

  it('rejects malformed recovered issues', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ body: 'marker', number: 'bad' }],
    }), { status: 200 }))
    await expect(findGithubIssueByMarker({
      accessToken: 'token', owner: 'acme', repo: 'site', marker: 'marker',
    })).rejects.toThrow('github_issue_search_failed')
  })
})
