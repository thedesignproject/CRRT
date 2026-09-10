import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'
import TurndownService from 'turndown'
import { publicPages } from './public-pages.ts'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'apps/landing/dist')
const configFile = join(root, 'apps/landing/vite.config.ts')
await build({ configFile })
const template = await readFile(join(dist, 'index.html'), 'utf8')
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
  document.querySelector('meta[name="description"]')!.setAttribute('content', page.description)
  const url = `https://crrt.ai${page.path}`
  const canonical = document.createElement('link')
  canonical.rel = 'canonical'; canonical.href = url; document.head.append(canonical)
  for (const [property, content] of Object.entries({ 'og:title': page.title, 'og:description': page.description, 'og:url': url, 'og:image': 'https://crrt.ai/favicon.png', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': 'https://crrt.ai/favicon.png' })) {
    const existing = document.querySelector(`meta[property="${property}"],meta[name="${property}"]`)
    const meta = existing || document.createElement('meta')
    if (!existing) meta.setAttribute('property', property)
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
// Source history is an actual modification date, not the scan/build time.
const lastmod = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'apps/landing', 'branding/crrt/tokens.css', 'scripts/build-landing.ts', 'scripts/public-pages.ts'], { cwd: root, encoding: 'utf8' }).trim()
await writeFile(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + publicPages.map(page => `  <url><loc>https://crrt.ai${page.path}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n') + '\n</urlset>\n')
await rm(join(dist, '.prerender'), { recursive: true, force: true })
console.log(`Prerendered ${publicPages.length} CRRT pages as HTML and Markdown.`)
