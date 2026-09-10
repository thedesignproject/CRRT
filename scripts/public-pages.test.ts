// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import SwaggerParser from '@apidevtools/swagger-parser'
import { publicPages, publicPageRoutes, applicationFallbackRoutes } from './public-pages'

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
    for (const script of window.document.querySelectorAll('script[src]')) expect(existsSync(resolve(dist, script.getAttribute('src')!.slice(1)))).toBe(true)
    window.happyDOM.abort()
  })
  it('publishes a namespaced sitemap of public pages with real ISO source dates', () => {
    const window = new Window()
    const doc = new window.DOMParser().parseFromString(read('sitemap.xml'), 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9')
    expect([...doc.querySelectorAll('loc')].map(node => node.textContent)).toEqual(publicPages.map(page => 'https://crrt.ai' + page.path))
    for (const node of doc.querySelectorAll('lastmod')) expect(Number.isNaN(Date.parse(node.textContent!))).toBe(false)
    expect(read('robots.txt')).toContain('Sitemap: https://crrt.ai/sitemap.xml')
    window.happyDOM.abort()
  })
  it('links only existing first-party resources from llms.txt and states access boundaries', () => {
    const llms = read('llms.txt')
    expect(llms).toMatch(/^# CRRT\n\n> /)
    expect(llms).toContain('## When to use CRRT')
    expect(llms).toContain('No official CLI or MCP server')
    for (const match of llms.matchAll(/\]\(https:\/\/crrt.ai([^)]*)\)/g)) {
      const path = match[1]
      expect(publicPages.some(page => page.path === path) || existsSync(resolve(dist, path.slice(1)))).toBe(true)
    }
  })
})

describe('routing boundaries', () => {
  const publicRoute = new RegExp(publicPageRoutes[0].src)
  it.each(publicPages)('negotiates only the known page $path', ({ path }) => {
    expect(publicRoute.test(path)).toBe(true)
    expect(publicRoute.test(path === '/' ? path : path + '/')).toBe(true)
  })
  it.each(['/api/v1/agent/shares/a/state', '/.well-known/workflow/v1/step', '/dashboard', '/dashboard/projects/a', '/audit/a', '/d/a', '/assets/app.js', '/docs/missing', '/docs-install'])('does not intercept %s', path => {
    expect(publicRoute.test(path)).toBe(false)
  })
  it.each([['/d/a', '/app-shell.html'], ['/dashboard', '/dashboard/index.html'], ['/dashboard/projects/a', '/dashboard/index.html'], ['/audit/a', '/app-shell.html'], ['/docs/missing', '/public-site?__public_path=$1']])('preserves the intended fallback for %s', (path, dest) => {
    expect(applicationFallbackRoutes.find(route => new RegExp(route.src).test(path))!.dest).toBe(dest)
  })
  it('wires public pages before filesystem and 404 after application routes in the deployment builder', () => {
    const source = readFileSync(resolve(root, 'scripts/build-vercel-output.ts'), 'utf8')
    expect(source.indexOf('...publicPageRoutes')).toBeLessThan(source.indexOf("{ handle: 'filesystem' }"))
    expect(source.indexOf('...applicationFallbackRoutes')).toBeGreaterThan(source.indexOf("{ handle: 'filesystem' }"))
    expect(source).toContain('await buildPublicFunction(root, output)')
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
