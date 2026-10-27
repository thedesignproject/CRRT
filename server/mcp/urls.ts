// Captured URLs can contain OAuth codes, session IDs, or signed-link secrets.
// Return only the page origin/path; arbitrary query names cannot be made safe
// with a credential denylist. Exact stored URLs remain valid filter inputs.
export function safeUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.search = ''
    url.hash = ''
    return url.href
  } catch { return null }
}
