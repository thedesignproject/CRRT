import { publicPages } from '../apps/landing/lib/publicPages.ts'
export { publicPages }

const pagePaths = publicPages.filter(page => page.path !== '/').map(page => page.path.slice(1))
export const publicPagePattern = `^/(?:${pagePaths.join('|')})?/?$`
// Keep each deployment regexp bounded as the public library grows. The full
// in-process matcher above remains useful for the local server.
const pageGroups = Array.from({ length: Math.ceil(pagePaths.length / 24) }, (_, index) => pagePaths.slice(index * 24, (index + 1) * 24))

/** Applied before filesystem routing; no dashboard, audit, share or API matches. */
export const publicPageRoutes = [
  { src: '^(/)$', dest: '/public-site?__public_path=$1' },
  ...pageGroups.map(group => ({ src: `^(/(?:${group.join('|')})/?)$`, dest: '/public-site?__public_path=$1' })),
  { src: '^/index\\.md$', headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, continue: true },
  ...pageGroups.map(group => ({ src: `^/(?:${group.join('|')})\\.md$`, headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, continue: true })),
]

/** Vite content-hashed assets are safe to cache; negotiated pages are not. */
export const staticAssetRoutes = [
  { src: '^/(?:dashboard/)?assets/.*$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }, continue: true },
]

export const applicationFallbackRoutes = [
  { src: '^/(?:privacy|support)/?$', dest: '/app-shell.html' },
  { src: '^/d/[^/]+/?$', dest: '/app-shell.html' },
  { src: '^/dashboard(?:/.*)?$', dest: '/dashboard/index.html' },
  { src: '^/audit(?:/.*)?$', dest: '/app-shell.html' },
  { src: '^(/.*)$', dest: '/public-site?__public_path=$1' },
]
