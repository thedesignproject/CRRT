export function applyPublicMetadata(page: { path: string; title: string; description: string }) {
  document.title = page.title
  const path = page.path
  const url = `https://crrt.ai${path}`
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
  document.querySelector('link[rel="alternate"][type="text/markdown"]')?.setAttribute('href', path === '/' ? '/index.md' : `${path}.md`)
  for (const [selector, content] of [
    ['meta[name="description"]', page.description],
    ['meta[property="og:title"]', page.title],
    ['meta[property="og:description"]', page.description],
    ['meta[property="og:url"]', url],
    ['meta[name="twitter:title"]', page.title],
    ['meta[name="twitter:description"]', page.description],
  ]) document.querySelector(selector)?.setAttribute('content', content)
}
