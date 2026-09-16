import Negotiator from 'negotiator'

export type PublicPage = { html: string; markdown: string }
export type PublicPages = Record<string, PublicPage>

export const notFoundMarkdown = '# 404 — Page not found\n\nTry the [CRRT homepage](https://crrt.ai/), [documentation](https://crrt.ai/docs), [agent guide](https://crrt.ai/llms.txt), or [sitemap](https://crrt.ai/sitemap.xml).\n'
const notFoundHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>404 — CRRT</title></head><body><h1>404 — Page not found</h1><p>Try the <a href="/">CRRT homepage</a>, <a href="/docs">documentation</a>, <a href="/llms.txt">agent guide</a>, or <a href="/sitemap.xml">sitemap</a>.</p></body></html>'

/** Only editorial pages reach this function. Assets and application routes bypass it. */
export function publicResponse(pathname: string, accept: string | undefined, method: string, pages: PublicPages): { status: number; headers: Record<string, string>; body: string } {
  const headers: Record<string, string> = {
    Vary: 'Accept, Accept-Encoding',
    // Vercel does not key its CDN cache on arbitrary Vary fields. Keep negotiated
    // responses out of shared caches; static JS/CSS still use the CDN normally.
    'Cache-Control': 'private, no-cache',
    'Vercel-CDN-Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  const finish = (status: number, type: string, body: string) => ({
    status, headers: { ...headers, 'Content-Type': `${type}; charset=utf-8` },
    body: method === 'HEAD' ? '' : body,
  })
  if (method !== 'GET' && method !== 'HEAD') {
    headers.Allow = 'GET, HEAD'
    return finish(405, 'text/plain', 'Method not allowed. Use GET or HEAD.\n')
  }
  const mediaType = new Negotiator({ headers: { accept } }).mediaType(['text/html; charset=utf-8', 'text/markdown; charset=utf-8'])?.split(';')[0]
  if (!mediaType) return finish(406, 'text/plain', 'Not acceptable. Supported types: text/html, text/markdown.\n')
  const path = pathname.replace(/\/$/, '') || '/'
  const page = Object.prototype.hasOwnProperty.call(pages, path) ? pages[path] : undefined
  if (!page) {
    headers['X-Robots-Tag'] = 'noindex'
    return finish(404, mediaType, mediaType === 'text/markdown' ? notFoundMarkdown : notFoundHtml)
  }
  return finish(200, mediaType, mediaType === 'text/markdown' ? page.markdown : page.html)
}
