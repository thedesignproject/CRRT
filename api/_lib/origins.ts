import type { VercelRequest } from '@vercel/node'
import { firstHeaderValue } from './http.js'

// Per-project origin allowlist for public comment ingestion.
//
// `projects.allowed_origins` stores normalized hostnames ("example.com").
// An empty list disables the check entirely — every origin may post. A
// request hostname matches an entry when it is equal to it or is a
// subdomain of it ("app.example.com" matches "example.com").

/**
 * Normalize a user-supplied domain to a bare lowercase hostname, accepting
 * full URLs and origins as input ("Example.com/", "https://a.b/x" → "a.b").
 * Returns null when the input cannot be parsed into a hostname.
 */
export function normalizeAllowedDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).hostname.replace(/\.$/, '') || null
  } catch {
    return null
  }
}

/**
 * Hostname the browser reports for the request — Origin first, falling back
 * to Referer (some user agents omit Origin on same-origin requests). Null
 * when neither header carries a parseable URL.
 */
export function getRequestHostname(req: VercelRequest): string | null {
  const source = firstHeaderValue(req.headers.origin) ?? firstHeaderValue(req.headers.referer)
  if (!source) return null
  try {
    return new URL(source).hostname.toLowerCase().replace(/\.$/, '') || null
  } catch {
    return null
  }
}

/**
 * `allowedDomains` entries are assumed pre-normalized — bare lowercase
 * hostnames, which is what the project PATCH handler writes — so matching is
 * plain string comparison. Un-normalized entries simply never match.
 */
export function isHostnameAllowed(hostname: string | null, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true
  if (!hostname) return false
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
}
