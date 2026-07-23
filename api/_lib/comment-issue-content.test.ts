import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCommentIssueContent } from './comment-issue-content.js'

const originals = {
  base: process.env.AI_API_BASE_URL,
  key: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  nodeEnv: process.env.NODE_ENV,
}
const fetchMock = vi.fn()
const comment = {
  id: 'comment-1',
  body: 'Make the CTA easier to read',
  authorName: 'Ada',
  pageUrl: 'https://example.com/pricing?token=secret#private',
  imageUrl: 'https://cdn.example.com/private.png',
  selector: '#cta',
  x: 10,
  y: 20,
  targetType: 'element_point' as const,
  anchor: null,
}

beforeEach(() => {
  process.env.AI_API_KEY = 'ai-secret'
  process.env.AI_MODEL = 'test-model'
  delete process.env.AI_API_BASE_URL
  process.env.NODE_ENV = 'test'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  process.env.AI_API_BASE_URL = originals.base
  process.env.AI_API_KEY = originals.key
  process.env.AI_MODEL = originals.model
  process.env.NODE_ENV = originals.nodeEnv
  vi.unstubAllGlobals()
})

describe('generateCommentIssueContent', () => {
  it('uses OpenAI-compatible JSON output without sending private context', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Improve CTA contrast',
        summary: 'The CTA lacks sufficient contrast.',
        implementationContext: 'Use the approved foreground token and verify both themes.',
      }) } }],
    }), { status: 200 }))

    await expect(generateCommentIssueContent({
      ...comment,
      anchor: {
        selectedText: 'Buy now',
        rangeClientRects: [{ left: 1, top: 2, width: 3, height: 4 }],
        createdAtViewport: { width: 1200, height: 800, scrollX: 0, scrollY: 50 },
        createdFromUrl: 'https://example.com/pricing?anchorSecret=yes',
        untrustedExtra: 'do-not-send',
      },
    })).resolves.toEqual({
      title: 'Improve CTA contrast',
      summary: 'The CTA lacks sufficient contrast.',
      implementationContext: 'Use the approved foreground token and verify both themes.',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.redirect).toBe('error')
    const request = JSON.parse(init.body)
    expect(request.messages[0].content).toContain('"additionalProperties":false')
    expect(request.messages[0].content).toContain('Every value must be a JSON string')
    const userContent = request.messages[1].content
    expect(userContent).toContain('https://example.com/pricing')
    expect(userContent).not.toContain('token=secret')
    expect(userContent).not.toContain(comment.imageUrl)
    expect(userContent).not.toContain('ai-secret')
    expect(userContent).toContain('Buy now')
    expect(userContent).not.toContain('anchorSecret')
    expect(userContent).not.toContain('do-not-send')
    const sentContext = JSON.parse(userContent)
    expect(sentContext).not.toHaveProperty('author')
    expect(sentContext).not.toHaveProperty('coordinates')
    expect(sentContext.anchor).toEqual({ selectedText: 'Buy now' })
  })

  it('supports a local OpenAI-compatible base URL outside production', async () => {
    process.env.AI_API_BASE_URL = 'http://127.0.0.1:11434/v1/'
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Title', summary: 'Summary', implementationContext: 'Context',
      }) } }],
    }), { status: 200 }))
    await generateCommentIssueContent(comment)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/v1/chat/completions')
  })

  it('supports IPv6 loopback outside production', async () => {
    process.env.AI_API_BASE_URL = 'http://[::1]:11434/v1'
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Title', summary: 'Summary', implementationContext: 'Context',
      }) } }],
    }), { status: 200 }))
    await generateCommentIssueContent(comment)
    expect(fetchMock.mock.calls[0][0]).toBe('http://[::1]:11434/v1/chat/completions')
  })

  it('falls back when configuration is missing', async () => {
    delete process.env.AI_API_KEY
    const result = await generateCommentIssueContent(comment)
    expect(result.title).toContain('Make the CTA easier to read')
    expect(fetchMock).not.toHaveBeenCalled()

    process.env.AI_API_KEY = 'key'
    delete process.env.AI_MODEL
    await generateCommentIssueContent(comment)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['provider error', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['network failure', () => Promise.reject(new Error('secret network error'))],
    ['malformed JSON', () => Promise.resolve(new Response('not json', { status: 200 }))],
    ['malformed content JSON', () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: 'not json' } }],
    }), { status: 200 }))],
    ['malformed output', () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"title":""}' } }],
    }), { status: 200 }))],
    ['non-string output', () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: { title: 'unsafe' } } }],
    }), { status: 200 }))],
  ])('uses deterministic fallback for %s', async (_name, response) => {
    fetchMock.mockImplementationOnce(response)
    const result = await generateCommentIssueContent(comment)
    expect(result.summary).toBe(comment.body)
    expect(result.implementationContext).toContain('smallest change')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('retries invalid schemas three times before accepting valid content', async () => {
    const response = (content: unknown) => new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 })
    fetchMock
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 'Title',
        summary: 'Summary',
        implementationContext: { adjustment: 'increase height' },
      })))
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 'Title',
        summary: 'Summary',
        implementationContext: 'Context',
        extra: 'not allowed',
      })))
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 42,
        summary: 'Summary',
        implementationContext: 'Context',
      })))
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 'Increase textarea height',
        summary: 'The textarea is too short.',
        implementationContext: 'Increase its minimum height and verify dark mode.',
      })))

    await expect(generateCommentIssueContent(comment)).resolves.toEqual({
      title: 'Increase textarea height',
      summary: 'The textarea is too short.',
      implementationContext: 'Increase its minimum height and verify dark mode.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const retryRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(retryRequest.messages[1].content).toContain('previous response was invalid')
    expect(retryRequest.messages[2].content).toContain(comment.body)
  })

  it('rejects insecure remote HTTP and malformed base URLs through fallback', async () => {
    process.env.AI_API_BASE_URL = 'http://provider.example/v1'
    await expect(generateCommentIssueContent(comment)).resolves.toMatchObject({
      summary: comment.body,
    })
    process.env.AI_API_BASE_URL = 'not a url'
    await expect(generateCommentIssueContent(comment)).resolves.toMatchObject({
      summary: comment.body,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires HTTPS for loopback in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.AI_API_BASE_URL = 'http://localhost:11434/v1'
    await generateCommentIssueContent(comment)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps output and handles empty feedback and invalid page metadata', async () => {
    delete process.env.AI_API_KEY
    const empty = await generateCommentIssueContent({
      ...comment,
      body: ' ',
      pageUrl: 'file:///secret',
      selector: '',
      x: Number.NaN,
      y: Number.NaN,
      targetType: 'text_range',
      anchor: { selectedText: 'Target' },
    })
    expect(empty.title).toBe('Address visual feedback')
    const longFallback = await generateCommentIssueContent({
      ...comment,
      body: 'x'.repeat(2_000),
    })
    expect(longFallback.summary).toHaveLength(1_000)

    process.env.AI_API_KEY = 'key'
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: ` ${'T'.repeat(200)} `,
        summary: ` ${'S'.repeat(2_000)} `,
        implementationContext: ` ${'C'.repeat(3_000)} `,
      }) } }],
    }), { status: 200 }))
    const capped = await generateCommentIssueContent(comment)
    expect(capped.title).toHaveLength(120)
    expect(capped.summary).toHaveLength(1_000)
    expect(capped.implementationContext).toHaveLength(2_000)
  })

  it('sanitizes invalid page and element metadata before a successful request', async () => {
    const response = () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: 'Title',
        summary: 'Summary',
        implementationContext: 'Context',
      }) } }],
    }), { status: 200 })
    fetchMock.mockResolvedValueOnce(response())
    const result = await generateCommentIssueContent({
      ...comment,
      pageUrl: 'not a url',
      selector: '',
      x: Number.NaN,
      y: Number.NaN,
    })
    expect(result.summary).toBe('Summary')
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(JSON.parse(request.messages[1].content)).toMatchObject({
      pageUrl: null,
      selector: null,
    })
    expect(JSON.parse(request.messages[1].content)).not.toHaveProperty('coordinates')

    fetchMock.mockResolvedValueOnce(response())
    await generateCommentIssueContent({ ...comment, pageUrl: 'http://example.com/path?secret=yes' })
    const httpRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(JSON.parse(httpRequest.messages[1].content).pageUrl).toBe('http://example.com/path')

    fetchMock.mockResolvedValueOnce(response())
    await generateCommentIssueContent({ ...comment, pageUrl: 'ftp://example.com/private' })
    const ftpRequest = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(JSON.parse(ftpRequest.messages[1].content).pageUrl).toBeNull()
  })

  it.each(['ftp://example.com/private', 'http://example.com/page'])(
    'handles page protocol %s without leaking unsupported metadata',
    async (pageUrl) => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 42 } }],
      }), { status: 200 }))
      await expect(generateCommentIssueContent({ ...comment, pageUrl })).resolves.toMatchObject({
        summary: comment.body,
      })
      const request = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(JSON.parse(request.messages[1].content).pageUrl).toBe(
        pageUrl.startsWith('http:') ? pageUrl : null,
      )
    },
  )
})
