// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { publicResponse, notFoundMarkdown } from './public-site'
import { createPublicHandler } from './public-site-handler'

const pages = { '/': { html: '<h1>CRRT</h1>', markdown: '# CRRT\n' }, '/docs': { html: '<h1>Docs</h1>', markdown: '# Docs\n' } }

describe('public content negotiation', () => {
  it.each([
    [undefined, 'text/html'], ['*/*', 'text/html'], ['text/*', 'text/html'],
    ['text/markdown', 'text/markdown'], ['TEXT/MARKDOWN', 'text/markdown'],
    ['text/html', 'text/html'], ['text/markdown;q=0.2,text/html;q=0.9', 'text/html'],
    ['text/html;q=0.3,text/markdown;q=0.8', 'text/markdown'],
    ['text/markdown;q=0,*/*;q=1', 'text/html'],
    ['text/html;q=0,text/*;q=0.5', 'text/markdown'],
    ['application/json, text/markdown;q=0.7', 'text/markdown'],
    ['text/html;charset=utf-8', 'text/html'],
  ])('negotiates %s as %s', (accept, type) => {
    const result = publicResponse('/', accept, 'GET', pages)
    expect(result.status).toBe(200)
    expect(result.headers['Content-Type']).toBe(`${type}; charset=utf-8`)
    expect(result.headers.Vary).toBe('Accept, Accept-Encoding')
    expect(result.headers['Vercel-CDN-Cache-Control']).toBe('no-store')
    expect(result.headers['CDN-Cache-Control']).toBe('no-store')
    expect(result.headers['Cache-Control']).toBe('private, no-cache')
    expect(result.body).toBe(type === 'text/html' ? pages['/'].html : pages['/'].markdown)
  })
  it.each(['application/json', '*/*;q=0', 'text/html;q=0,text/markdown;q=0'])('returns 406 for %s', accept => {
    expect(publicResponse('/', accept, 'GET', pages)).toMatchObject({ status: 406 })
  })
  it('supports HEAD with the same response headers and no body, including errors', () => {
    for (const path of ['/', '/missing']) {
      for (const accept of ['text/html', 'text/markdown', 'application/json']) {
        const get = publicResponse(path, accept, 'GET', pages)
        expect(publicResponse(path, accept, 'HEAD', pages)).toEqual({ ...get, body: '' })
      }
    }
  })
  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('rejects %s without mutation', method => {
    expect(publicResponse('/', '*/*', method, pages)).toMatchObject({ status: 405, headers: { Allow: 'GET, HEAD' } })
  })
  it('resolves exact editorial pages with an optional trailing slash', () => {
    expect(publicResponse('/docs/', 'text/markdown', 'GET', pages).body).toBe(pages['/docs'].markdown)
  })
  it.each(['/missing', '/docs/missing', '/constructor', '/__proto__', '/toString'])('returns a helpful real 404 for %s', path => {
    expect(publicResponse(path, 'text/markdown', 'GET', pages)).toMatchObject({ status: 404, body: notFoundMarkdown, headers: { 'X-Robots-Tag': 'noindex' } })
    const html = publicResponse(path, 'text/html', 'GET', pages)
    expect(html.status).toBe(404)
    expect(html.body).toContain('href="/sitemap.xml"')
  })
  it('serves the Node adapter through HTTP, including the Vercel rewrite parameter', async () => {
    const server = createServer(createPublicHandler(pages))
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address() as { port: number }
    try {
      for (const path of ['/', '/public-site?__public_path=%2Fdocs']) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Accept: 'text/markdown' } })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe(path === '/' ? pages['/'].markdown : pages['/docs'].markdown)
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
