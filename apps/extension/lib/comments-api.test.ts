import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessage = vi.hoisted(() => vi.fn())
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }))

import { createPageComment, deletePageComment, listPageComments, updatePageComment } from './comments-api'

const comment = { id: 'a/b', pageUrl: 'https://example.com', pageHostname: 'example.com', x: 1, y: 2, selector: '#x', body: 'Hi', screenshotUrl: null, createdAt: 'now', updatedAt: 'now' }

beforeEach(() => {
  vi.restoreAllMocks(); sendMessage.mockReset()
  vi.stubEnv('WXT_API_BASE', 'https://crrt.ai/api/')
  sendMessage.mockResolvedValue({ ok: true, data: { accessToken: 'token', email: 'u@example.com' } })
})

describe('extension comments API client', () => {
  it('lists exact-page comments with authenticated headers', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [comment] }), { status: 200 }))
    await expect(listPageComments('https://example.com/a?q=1#x')).resolves.toEqual({ items: [comment] })
    expect(fetch).toHaveBeenCalledWith('https://crrt.ai/api/v1/extension/comments?pageUrl=https%3A%2F%2Fexample.com%2Fa%3Fq%3D1%23x&limit=50&page=1', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }))
  })

  it('creates, updates, and deletes comments', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(comment), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(comment), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await createPageComment({ pageUrl: comment.pageUrl, selector: '#x', x: 1, y: 2, body: 'Hi', screenshot: null })
    await updatePageComment('a/b', 'Updated')
    await expect(deletePageComment('a/b')).resolves.toBeUndefined()
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: expect.stringContaining('"body":"Hi"') })
    expect(fetch.mock.calls[1]?.[0]).toContain('/a%2Fb')
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('rejects missing sessions and background failures', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, data: null })
    await expect(listPageComments('https://example.com')).rejects.toThrow('Sign in')
    sendMessage.mockResolvedValueOnce({ ok: false, error: 'auth down' })
    await expect(listPageComments('https://example.com')).rejects.toThrow('auth down')
    sendMessage.mockResolvedValueOnce(undefined)
    await expect(listPageComments('https://example.com')).rejects.toThrow('authentication is unavailable')
  })

  it('uses API error messages and status fallbacks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Nope' }), { status: 400 }))
    await expect(listPageComments('https://example.com')).rejects.toThrow('Nope')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not json', { status: 503 }))
    await expect(listPageComments('https://example.com')).rejects.toThrow('CRRT request failed (503)')
  })
})
