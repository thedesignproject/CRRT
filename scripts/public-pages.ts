export { publicPages } from '../apps/landing/lib/publicPages.ts'

export const publicPagePattern = '^/(?:docs(?:/(?:install|agent-handoff|self-host))?/?)?$'

/** Applied before filesystem routing; no dashboard, audit, share or API matches. */
export const publicPageRoutes = [
  { src: '^(' + publicPagePattern.slice(1, -1) + ')$', dest: '/public-site?__public_path=$1' },
  { src: '^/(?:index|docs(?:/(?:install|agent-handoff|self-host))?)\\.md$', headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, continue: true },
]

export const applicationFallbackRoutes = [
  { src: '^/d/[^/]+/?$', dest: '/app-shell.html' },
  { src: '^/dashboard(?:/.*)?$', dest: '/dashboard/index.html' },
  { src: '^/audit(?:/.*)?$', dest: '/app-shell.html' },
  { src: '^(/.*)$', dest: '/public-site?__public_path=$1' },
]
