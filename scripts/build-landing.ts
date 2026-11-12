import { build } from 'vite'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'
import TurndownService from 'turndown'
// Tests invoke this in a child process; always verify and emit the actual
// production bundle, including removal of development-only content loaders.
process.env.NODE_ENV = 'production'
await import('./generate-resource-catalog.ts')
const { publicPages } = await import('./public-pages.ts')
const { resources, resourcePath } = await import('../apps/landing/resources/content.ts')

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'apps/landing/dist')
const configFile = join(root, 'apps/landing/vite.config.ts')
await build({ configFile })
const template = await readFile(join(dist, 'index.html'), 'utf8')
const manifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string; css?: string[]; imports?: string[] }>
// Shared links and audit workspaces still boot from their original empty shell.
await writeFile(join(dist, 'app-shell.html'), template)
await build({ configFile, build: {
  ssr: join(root, 'apps/landing/prerender.tsx'), outDir: join(dist, '.prerender'),
  copyPublicDir: false,
} })
const { render } = await import(pathToFileURL(join(dist, '.prerender/prerender.js')).href)
const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'button', 'svg', 'noscript'])
const pages: Record<string, { html: string; markdown: string }> = {}
const schema = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication',
  name: 'CRRT', url: 'https://crrt.ai/', applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web', description: publicPages[0].description,
  sameAs: ['https://github.com/thedesignproject/CRRT', 'https://www.npmjs.com/package/@thedesignproject/crrt'],
}
for (const page of publicPages) {
  const document = window.document
  document.write(template.replace('<div id="root"></div>', () => `<div id="root">${render(page.path)}</div>`))
  document.title = page.title
  // Split route styles must be in the initial HTML, including without JS.
  // Preload the same route modules without pulling in unrelated app surfaces.
  const visited = new Set<string>()
  const routeStyles = new Set<string>()
  const routeModules = new Set<string>()
  function collectEntry(key: string) {
    if (visited.has(key)) return
    visited.add(key)
    const entry = manifest[key]
    if (!entry) throw new Error(`Missing public route manifest entry: ${key}`)
    for (const dependency of entry.imports ?? []) collectEntry(dependency)
    for (const css of entry.css ?? []) routeStyles.add(css)
    routeModules.add(entry.file)
  }
  collectEntry(page.path.startsWith('/resources') ? 'resources/ResourcesPage.tsx' : 'App.tsx')
  if (page.path.startsWith('/resources')) {
    collectEntry(page.path === '/resources' ? 'resources/ResourcesIndex.tsx' : 'resources/ResourceArticle.tsx')
    if (resources.find(resource => resourcePath(resource) === page.path)?.tool) collectEntry('resources/ResourceTool.tsx')
  }
  for (const [rel, files] of [['stylesheet', routeStyles], ['modulepreload', routeModules]] as const) {
    for (const file of files) {
      if (document.querySelector(`link[rel="${rel}"][href="/${file}"]`)) continue
      const link = document.createElement('link'); link.rel = rel; link.href = `/${file}`
      if (rel === 'modulepreload') link.setAttribute('crossorigin', '')
      document.head.append(link)
    }
  }
  document.querySelector('meta[name="description"]')!.setAttribute('content', page.description)
  const url = `https://crrt.ai${page.path}`
  const canonical = document.createElement('link')
  canonical.rel = 'canonical'; canonical.href = url; document.head.append(canonical)
  const isResource = page.path.startsWith('/resources')
  const image = isResource ? 'https://crrt.ai/resources-og.png' : 'https://crrt.ai/favicon.png'
  for (const [property, content] of Object.entries({ 'og:title': page.title, 'og:description': page.description, 'og:url': url, 'og:image': image, 'og:type': page.path.startsWith('/resources/') ? 'article' : 'website', 'twitter:card': isResource ? 'summary_large_image' : 'summary', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': image })) {
    const existing = document.querySelector(`meta[property="${property}"],meta[name="${property}"]`)
    const meta = existing || document.createElement('meta')
    if (!existing) meta.setAttribute(property.startsWith('twitter:') ? 'name' : 'property', property)
    meta.setAttribute('content', content); document.head.append(meta)
  }
  const alternate = document.createElement('link')
  alternate.rel = 'alternate'; alternate.type = 'text/markdown'; alternate.href = page.path === '/' ? '/index.md' : `${page.path}.md`
  document.head.append(alternate)
  if (page.path === '/') {
    const script = document.createElement('script'); script.type = 'application/ld+json'
    script.textContent = JSON.stringify(schema); document.head.append(script)
  }
  const noscript = document.createElement('noscript')
  noscript.innerHTML = '<style>.reveal-on-scroll{opacity:1!important;transform:none!important}*,*::before,*::after{animation:none!important}</style>'
  document.head.append(noscript)
  const html = '<!doctype html>\n' + document.documentElement.outerHTML
  // Strip decorative/demo-only and navigation markup before conversion.
  const content = page.path === '/' ? document.getElementById('root')! : document.querySelector('main')!
  content.querySelectorAll('[aria-hidden="true"],nav,style,script').forEach(element => element.remove())
  const markdown = turndown.turndown(content.innerHTML) + '\n'
  pages[page.path] = { html, markdown }
  const filename = page.path === '/' ? 'index.html' : `${page.path.slice(1)}/index.html`
  await mkdir(dirname(join(dist, filename)), { recursive: true })
  await writeFile(join(dist, filename), html)
  await writeFile(join(dist, page.path === '/' ? 'index.md' : `${page.path.slice(1)}.md`), markdown)
  document.open()
}
await window.happyDOM.close()
await writeFile(join(dist, 'public-pages.json'), JSON.stringify(pages))
// Deployment source archives contain no Git history; omit the optional lastmod.
await writeFile(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + publicPages.map(page => `  <url><loc>https://crrt.ai${page.path}</loc></url>`).join('\n') + '\n</urlset>\n')
await rm(join(dist, '.prerender'), { recursive: true, force: true })
console.log(`Prerendered ${publicPages.length} CRRT pages as HTML and Markdown.`)
