// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('./auth.js', async original => ({ ...await original<object>(), oauth: vi.fn() }))
vi.mock('./transport.js', () => ({ mcpHandler: vi.fn() }))
import { oauth } from './auth.js'
import { mcpHandler } from './transport.js'
import { mcpHttp, metadataPath, nodeMcp } from './http.js'
import mcpRoute from '../../api/mcp/v1.js'
import oauthRoute from '../../api/mcp/oauth/[action].js'
const transport = vi.fn()
beforeEach(() => {
  vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001')
  vi.stubEnv('MCP_BROWSER_ORIGINS', undefined)
  vi.mocked(oauth).mockReset().mockImplementation(async () => Response.json({ oauth: true }))
  vi.mocked(mcpHandler).mockReturnValue(transport)
  transport.mockReset().mockImplementation(async () => Response.json({ tools: true }))
})
afterEach(() => vi.unstubAllEnvs())
it('routes discovery metadata and preserves authorization query parameters', async () => {
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp/v1']) {
    expect((await mcpHttp(new Request(`http://127.0.0.1:3001${path}`))).status).toBe(200)
  }
  expect(metadataPath('/other')).toBe('/other')
  await mcpHttp(new Request('http://127.0.0.1:3001/api/mcp/oauth/authorize?state=preserved'))
  expect(vi.mocked(oauth).mock.lastCall![0].url).toContain('state=preserved')
  expect(await (await mcpHttp(new Request('http://127.0.0.1:3001/api/mcp/v1', { method: 'POST', body: '{}' }))).json()).toEqual({ tools: true })
})
it('allows configured browser origins, rejects others, and handles preflight', async () => {
  vi.stubEnv('MCP_BROWSER_ORIGINS', 'http://localhost:6274')
  const response = await mcpHttp(new Request('http://127.0.0.1:3001/api/mcp/v1', { method: 'OPTIONS', headers: { origin: 'http://localhost:6274' } }))
  expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:6274')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect((await mcpHttp(new Request('http://127.0.0.1:3001/api/mcp/v1', { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
})
it('adapts Node/Vercel requests, including body formats, query values, and route parameters', async () => {
  const res = () => ({ code: 200, body: undefined as unknown, headers: {} as Record<string, string>, status(n: number) { this.code = n; return this }, setHeader(n: string, v: string) { this.headers[n] = v }, send(v: unknown) { this.body = v }, json(v: unknown) { this.body = v } })
  const call = (req: object, target = '/api/mcp/oauth/metadata') => nodeMcp(req as never, res() as never, target)
  await call({ headers: { accept: ['application/json', 'text/event-stream'], absent: undefined }, query: { action: 'metadata', state: 'value', ignored: ['a', 'b'] } })
  expect(vi.mocked(oauth).mock.lastCall![0].url).toContain('state=value')
  expect(vi.mocked(oauth).mock.lastCall![0].url).not.toContain('action=')
  await call({ method: 'POST', headers: { 'content-type': 'application/json' }, query: {}, body: { value: 1 } }, '/api/mcp/v1')
  expect(await transport.mock.lastCall![0].text()).toBe('{"value":1}')
  await call({ method: 'POST', headers: {}, query: {}, body: 'form=value' }, '/api/mcp/v1')
  expect(await transport.mock.lastCall![0].text()).toBe('form=value')
  for (const action of ['token', 'revoke']) {
    const fields = { client_id: 'client', grant_type: 'refresh_token', refresh_token: 'private-test-token' }
    await call({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, query: {}, body: fields }, `/api/mcp/oauth/${action}`)
    const forwarded = vi.mocked(oauth).mock.lastCall![0]
    expect(forwarded.headers.get('content-type')).toBe('application/json')
    expect(await forwarded.json()).toEqual(fields)
  }
  await call({ method: 'OPTIONS', headers: {}, query: {}, body: {} })
  const one = res(); await mcpRoute({ method: 'GET', headers: {}, query: {} } as never, one as never)
  expect(one.code).toBe(200)
  const two = res(); await oauthRoute({ method: 'GET', headers: {}, query: { action: 'metadata' } } as never, two as never)
  expect(two.headers['content-type']).toContain('application/json')
  vi.stubEnv('MCP_ORIGIN', undefined)
  const failure = res(); await nodeMcp({ headers: {}, query: {} } as never, failure as never, '/api/mcp/v1')
  expect(failure.code).toBe(400)
})
