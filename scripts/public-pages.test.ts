// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import SwaggerParser from '@apidevtools/swagger-parser'
import { publicPages, publicPageRoutes, applicationFallbackRoutes, staticAssetRoutes } from './public-pages'
import { resources, resourcePath } from '../apps/landing/resources/content'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'apps/landing/dist')
const read = (path: string) => readFileSync(resolve(dist, path), 'utf8')
beforeAll(() => execFileSync('node', ['scripts/build-landing.ts'], { cwd: root, stdio: 'pipe' }), 60_000)

describe('built public pages', () => {
  it.each(publicPages)('serves meaningful existing content at $path without JavaScript', page => {
    const pages = JSON.parse(read('public-pages.json'))
    const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
    const doc = window.document
    doc.write(pages[page.path].html)
    expect(doc.querySelectorAll('h1')).toHaveLength(1)
    doc.querySelectorAll('script,style,svg').forEach(node => node.remove())
    expect(doc.body.textContent!.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(500)
    expect(doc.title).toBe(page.title)
    expect(doc.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe('https://crrt.ai' + page.path)
    expect(pages[page.path].html).toContain('data-source="crrt-tokens"')
    expect(pages[page.path].html).toContain('.reveal-on-scroll{opacity:1!important')
    const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node => Number(node.tagName[1]))
    headings.forEach((level, i) => expect(level).toBeLessThanOrEqual((headings[i - 1] || 0) + 1))
    const markdown = read(page.path === '/' ? 'index.md' : `${page.path.slice(1)}.md`)
    expect(markdown).toBe(pages[page.path].markdown)
    expect(markdown).toContain('# ')
    expect(markdown.length).toBeGreaterThan(500)
    expect(markdown).not.toMatch(/<script|<style|<svg|localhost:5173/)
    window.happyDOM.abort()
  })
  it('keeps the app shell separate and makes Docs discoverable in homepage HTML', () => {
    expect(read('app-shell.html')).toContain('<div id="root"></div>')
    expect(read('index.html')).toContain('href="/docs"')
    const window = new Window()
    window.document.write(read('index.html'))
    const schema = JSON.parse(window.document.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(schema).toMatchObject({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'CRRT', url: 'https://crrt.ai/' })
    const scripts = [...window.document.querySelectorAll('script[src]')]
    const analyticsUrl = 'https://www.googletagmanager.com/gtag/js?id=G-JQN2RFQPL3'
    expect(scripts.filter(script => script.getAttribute('src') === analyticsUrl)).toHaveLength(1)
    for (const script of scripts) {
      const src = script.getAttribute('src')!
      if (src === analyticsUrl) {
        expect(script.hasAttribute('async')).toBe(true)
      } else {
        expect(src).toMatch(/^\/assets\//)
        expect(existsSync(resolve(dist, src.slice(1)))).toBe(true)
      }
    }
    window.happyDOM.abort()
  })

  it('keeps lazy decorative figures out of the static server renderer', () => {
    expect(read('resources/index.html')).not.toContain('<template')
    expect(read('resources/index.html')).toContain('resource-figure')
  })

  it('keeps full article bodies out of the client JavaScript bundles', () => {
    const manifest = JSON.parse(read('.vite/manifest.json'))
    const scripts = Object.values(manifest).map((entry: any) => entry.file).filter((file: string) => file.endsWith('.js')).map((file: string) => read(file)).join('\n')
    for (const resource of resources) expect(scripts.includes(resource.sections[0].paragraphs[0]), resource.slug).toBe(false)
    const window = new Window()
    window.document.write(read('resources/index.html'))
    expect(window.document.getElementById('resource-page-data')).toBeNull()
    window.happyDOM.abort()
  })

  it.each(publicPages)('ships route CSS and preload links in the initial HTML at $path', page => {
    const manifest = JSON.parse(read('.vite/manifest.json'))
    const entry = manifest[page.path.startsWith('/resources') ? 'resources/ResourcesPage.tsx' : 'App.tsx']
    const html = read(page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`)
    expect(html).toContain(`href="/${entry.file}"`)
    for (const css of entry.css || []) expect(html).toContain(`href="/${css}"`)
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    if (page.path.startsWith('/resources')) {
      expect(html).not.toContain(`href="/${manifest['App.tsx'].file}"`)
      const window = new Window()
      window.document.write(html)
      const styles = [...window.document.querySelectorAll('link[rel="stylesheet"]')]
        .map(link => read(link.getAttribute('href')!.slice(1))).join('\n')
      expect(styles).not.toContain('.landing-glass-comment.is-left')
      expect(styles).toContain('.landing-navigation')
      expect(styles).toContain('.landing-footer')
      window.happyDOM.abort()
    }
  })
  it('publishes a namespaced sitemap without requiring Git history', () => {
    const window = new Window()
    const doc = new window.DOMParser().parseFromString(read('sitemap.xml'), 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
    expect([...doc.querySelectorAll('loc')].map(node => node.textContent)).toEqual(publicPages.map(page => 'https://crrt.ai' + page.path))
    expect(doc.querySelectorAll('lastmod')).toHaveLength(0)
    expect(read('robots.txt')).toContain('Sitemap: https://crrt.ai/sitemap.xml')
    window.happyDOM.abort()
  })
  it('links only existing first-party resources from llms.txt and states access boundaries', () => {
    const llms = read('llms.txt')
    expect(llms).toMatch(/^# CRRT\n\n> /)
    expect(llms).toContain('## When to use CRRT')
    expect(llms).toContain('CRRT MCP is available over Streamable HTTP at /api/mcp/v1')
    for (const match of llms.matchAll(/\]\(https:\/\/crrt.ai([^)]*)\)/g)) {
      const path = match[1]
      expect(publicPages.some(page => page.path === path) || existsSync(resolve(dist, path.slice(1)))).toBe(true)
    }
  })

  it.each(resources)('publishes accurate resource metadata, article markup, and a share image for $slug', resource => {
    const window = new Window()
    window.document.write(read(`${resourcePath(resource).slice(1)}/index.html`))
    const doc = window.document
    const schemas = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(script => JSON.parse(script.textContent!))
    expect(schemas.find(schema => schema['@type'] === 'Article')).toMatchObject({ headline: resource.title, mainEntityOfPage: `https://crrt.ai${resourcePath(resource)}`, author: { name: 'CRRT' } })
    expect(schemas.find(schema => schema['@type'] === 'BreadcrumbList').itemListElement.at(-1).item).toBe(`https://crrt.ai${resourcePath(resource)}`)
    expect(doc.querySelector('meta[property="og:type"]')!.getAttribute('content')).toBe('article')
    expect(doc.querySelector('meta[property="og:image"]')!.getAttribute('content')).toBe('https://crrt.ai/resources-og.png')
    expect(doc.querySelector('meta[name="twitter:card"]')!.getAttribute('content')).toBe('summary_large_image')
    expect(existsSync(resolve(dist, 'resources-og.png'))).toBe(true)
    expect(doc.querySelector('article')!.textContent).toContain(resource.answer)
    expect(doc.querySelector('article')!.textContent).toContain('Written with AI assistance')
    const catalog = JSON.parse(doc.getElementById('resource-catalog-data')!.textContent!)
    expect(catalog.length).toBeLessThanOrEqual(14)
    for (const related of resource.related) expect(catalog.some((item: {slug: string}) => item.slug === related)).toBe(true)
    const serialized = JSON.parse(doc.getElementById('resource-page-data')!.textContent!)
    expect(serialized).toEqual(resource)
    expect(doc.querySelectorAll('#resource-page-data')).toHaveLength(1)
    if (resource.tool) {
      expect(schemas.find(schema => schema['@type'] === 'WebApplication')).toMatchObject({ name: resource.title, isAccessibleForFree: true })
      expect(doc.getElementById('interactive-tool')).not.toBeNull()
      expect(doc.querySelector('noscript')).not.toBeNull()
    }
    window.happyDOM.abort()
  })
})

describe('routing boundaries', () => {
  const publicRoute = { test: (path: string) => publicPageRoutes.some(route => 'dest' in route && new RegExp(route.src).test(path)) }
  it('keeps deployment route expressions bounded as the library grows', () => {
    for (const route of publicPageRoutes) expect(route.src.length).toBeLessThan(4096)
  })
  it.each(publicPages)('negotiates only the known page $path', ({ path }) => {
    expect(publicRoute.test(path)).toBe(true)
    expect(publicRoute.test(path === '/' ? path : path + '/')).toBe(true)
  })
  it.each(['/api/v1/agent/shares/a/state', '/.well-known/workflow/v1/step', '/dashboard', '/dashboard/projects/a', '/audit/a', '/d/a', '/assets/app.js', '/docs/missing', '/docs-install', '/resources/missing', '/resources-design-systems'])('does not intercept %s', path => {
    expect(publicRoute.test(path)).toBe(false)
  })
  it.each([['/privacy', '/app-shell.html'], ['/support/', '/app-shell.html'], ['/d/a', '/app-shell.html'], ['/dashboard', '/dashboard/index.html'], ['/dashboard/projects/a', '/dashboard/index.html'], ['/audit/a', '/app-shell.html'], ['/docs/missing', '/public-site?__public_path=$1']])('preserves the intended fallback for %s', (path, dest) => {
    expect(applicationFallbackRoutes.find(route => new RegExp(route.src).test(path))!.dest).toBe(dest)
  })
  it('keeps legacy Vercel rewrites from swallowing unknown documentation URLs', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
    // Vercel applies these alongside generated output routes. A docs catchall
    // would serve the homepage with 200 before the public handler can return 404.
    expect(config.rewrites.some((rewrite: { source: string }) => rewrite.source.startsWith('/docs'))).toBe(false)
    expect(applicationFallbackRoutes.find(route => new RegExp(route.src).test('/docs/missing'))!.dest)
      .toBe('/public-site?__public_path=$1')
  })
  it('wires public pages before filesystem and 404 after application routes in the deployment builder', () => {
    const source = readFileSync(resolve(root, 'scripts/build-vercel-output.ts'), 'utf8')
    expect(source.indexOf('...publicPageRoutes')).toBeLessThan(source.indexOf("{ handle: 'filesystem' }"))
    expect(source.indexOf('...applicationFallbackRoutes')).toBeGreaterThan(source.indexOf("{ handle: 'filesystem' }"))
    expect(source).toContain('await buildPublicFunction(root, output)')
    expect(source.indexOf('...staticAssetRoutes')).toBeLessThan(source.indexOf("{ handle: 'filesystem' }"))
    expect(staticAssetRoutes.find(route => new RegExp(route.src).test('/assets/app-123.js'))?.headers['Cache-Control']).toContain('immutable')
    expect(staticAssetRoutes.find(route => new RegExp(route.src).test('/dashboard/assets/app-123.js'))?.headers['Cache-Control']).toContain('immutable')
    expect(staticAssetRoutes.some(route => new RegExp(route.src).test('/resources'))).toBe(false)
  })
})

it('validates OpenAPI 3.1 and maps every documented operation to an existing authenticated handler', async () => {
  const spec = JSON.parse(read('openapi.json'))
  await SwaggerParser.validate(structuredClone(spec))
  const ids: string[] = []
  for (const [path, methods] of Object.entries(spec.paths) as [string, Record<string, any>][]) {
    const file = resolve(root, path.slice(1).replace('{slug}', '[slug]') + '.ts')
    const handler = readFileSync(file, 'utf8')
    expect(handler).toContain('requireAgentShare(req, res, slug)')
    for (const [method, operation] of Object.entries(methods)) {
      expect(handler).toContain(`req.method !== '${method.toUpperCase()}'`)
      expect(operation.description.length).toBeGreaterThan(20)
      expect(operation.responses['401']).toBeDefined()
      ids.push(operation.operationId)
    }
  }
  expect(new Set(ids).size).toBe(ids.length)
  expect(spec.security).toEqual([{ shareBearer: [] }, { shareHeader: [] }])
})
