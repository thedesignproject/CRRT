// The dashboard is served under Vite's configured base (e.g. /dashboard/) so it
// can share one Vercel deployment with the landing site. BASE_URL is injected at
// build time and always carries a trailing slash.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/** Build an absolute app path under the base, e.g. route('/login') -> '/dashboard/login'. */
export function route(path: string): string {
  return path === '/' ? `${BASE}/` : `${BASE}${path}`
}

/** Strip the base prefix off a real pathname so route matching stays base-agnostic. */
export function relPath(pathname: string): string {
  if (!BASE) return pathname
  if (pathname === BASE) return '/'
  return pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) : pathname
}
