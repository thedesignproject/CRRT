import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authFailure, config, ensure, oauth } from './auth.js'
import { mcpHandler } from './transport.js'
import { tools } from './tools.js'

export function metadataPath(path: string) {
  if (path === '/.well-known/oauth-authorization-server') return '/api/mcp/oauth/metadata'
  if (['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp/v1'].includes(path)) return '/api/mcp/oauth/resource'
  return path
}
export async function mcpHttp(request: Request) {
  let response: Response
  try {
    const { origin } = config()
    const browserOrigin = request.headers.get('origin')
    const allowed = [origin, ...(process.env.MCP_BROWSER_ORIGINS ?? '').split(',')]
    ensure(!browserOrigin || allowed.includes(browserOrigin), 403, 'origin_not_allowed')
    if (request.method === 'OPTIONS') response = new Response(null, { status: 204 })
    else {
      const url = new URL(request.url)
      const path = metadataPath(url.pathname)
      const forwarded = new Request(new URL(path + url.search, origin), request)
      response = path.startsWith('/api/mcp/oauth/') ? await oauth(forwarded) : await mcpHandler(tools)(forwarded)
    }
    if (browserOrigin) response.headers.set('Access-Control-Allow-Origin', browserOrigin)
    response.headers.set('Vary', 'Origin')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id')
    response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version, X-Request-Id, Retry-After')
  } catch (error) { response = authFailure(error) }
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}
export async function nodeMcp(req: VercelRequest, res: VercelResponse, path: string) {
  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    const method = req.method ?? 'GET'
    const body = method === 'GET' || method === 'OPTIONS' ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    // Vercel parses JSON and form bodies into objects. Keep the reconstructed
    // content type consistent so OAuth does not parse JSON as form text.
    if (body !== undefined && typeof req.body !== 'string') headers.set('Content-Type', 'application/json')
    const url = new URL(path, config().origin)
    for (const [name, value] of Object.entries(req.query)) if (typeof value === 'string' && name !== 'action') url.searchParams.set(name, value)
    const response = await mcpHttp(new Request(url, { method, headers, body }))
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.status(response.status).send(await response.text())
  } catch (error) {
    const response = authFailure(error)
    res.status(response.status).json(await response.json())
  }
}
