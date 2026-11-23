// In-memory stand-in for the CRRT public API, mounted into the visual-test
// harness by harness.vite.config.ts. Local experiment only.
//
// MOCK_FAIL_RATE (0..1): share of write requests (POST/PATCH/DELETE) that
// answer 500 on purpose, to exercise the widget's error handling.
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appendFileSync } from 'node:fs'
import { comments as seed, fixedTime, project } from '../tests/visual/fixtures/data'

type Row = Record<string, unknown> & { id: string; body: string; reviewStatus: string }

const FAIL_RATE = Number(process.env.MOCK_FAIL_RATE ?? 0)
const LOG = process.env.MOCK_LOG ?? ''

export function mockApi(): Plugin {
  let rows: Row[] = seed.map((c) => ({ ...c, pageUrl: '' }))
  let nextId = 1
  // Only ever go up, so a stale read can delay a rule's verdict but never hide a write.
  const stats = { approvals: 0, deletes: 0 }
  const log = (line: string) => { if (LOG) appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`) }

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.statusCode = status
    if (body === undefined) return res.end()
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const readJson = (req: IncomingMessage) => new Promise<Record<string, unknown>>((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
  })

  return {
    name: 'crrt-mock-api',
    configureServer(server) { server.middlewares.use('/api', handler) },
    configurePreviewServer(server) {
      server.middlewares.use('/api', handler)
      // SPA fallback for the harness routes (dev server does this itself).
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'GET' && req.url && !req.url.includes('.') && !req.url.startsWith('/api')) req.url = '/index.html'
        next()
      })
    },
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
      {
        const url = new URL(req.url ?? '/', 'http://mock')
        const method = req.method ?? 'GET'
        const isWrite = method !== 'GET'
        if (isWrite && !url.pathname.startsWith('/__mock/') && Math.random() < FAIL_RATE) {
          log(`${method} ${url.pathname} -> 500 (injected)`)
          return send(res, 500, { error: 'Injected failure' })
        }

        if (url.pathname === '/v1/public/comments') {
          if (method === 'GET') {
            // Seeded rows belong to whatever page asks (the widget filters by pageUrl).
            const page = String(req.headers.referer ?? '')
            return send(res, 200, rows.map((r) => (r.pageUrl ? r : { ...r, pageUrl: page })))
          }
          if (method === 'POST') {
            const body = await readJson(req)
            const row: Row = { ...body, id: `mock-${nextId++}`, body: String(body.body ?? ''), reviewStatus: 'open', createdAt: fixedTime, editable: true }
            rows = [row, ...rows]
            log(`POST comment ${row.id} "${row.body.slice(0, 40)}"`)
            return send(res, 201, row)
          }
          if (method === 'PATCH') {
            const body = await readJson(req)
            const row = rows.find((r) => r.id === body.id)
            if (!row) return send(res, 404, { error: 'Not found' })
            // Mirrors api/v1/public/comments.ts: only reviewStatus can change.
            if (typeof body.reviewStatus === 'string') row.reviewStatus = body.reviewStatus
            if (row.reviewStatus === 'accepted') stats.approvals++
            log(`PATCH ${row.id} reviewStatus=${row.reviewStatus}${'body' in body ? ' (body ignored)' : ''}`)
            return send(res, 200, row)
          }
          if (method === 'DELETE') {
            const id = url.searchParams.get('id')
            rows = rows.filter((r) => r.id !== id)
            stats.deletes++
            log(`DELETE ${id}`)
            return send(res, 204)
          }
        }
        if (url.pathname === '/v1/agent/eligibility') {
          return send(res, 200, { canRequest: false, mustSignUp: false, isProjectMember: false, currentTier: null })
        }
        // Dashboard endpoints its built-in mocks don't cover: empty, well-shaped.
        const p = url.pathname
        if (method === 'GET') {
          if (p === '/v1/recordings') return send(res, 200, { recordings: [], next: null })
          if (p === '/v1/extension/comments') return send(res, 200, { items: [], page: 1, limit: 20, total: 0 })
          if (p === '/v1/projects/suggestions') return send(res, 200, [])
          if (p === '/v1/billing') return send(res, 200, { enabled: false })
          if (/^\/v1\/projects\/[^/]+\/repo-config$/.test(p)) return send(res, 200, null)
          if (/^\/v1\/projects\/[^/]+\/(email-domains|access-requests)$/.test(p)) return send(res, 200, [])
          if (p === '/v1/projects') return send(res, 200, [{ ...project, role: 'owner', capabilities: ['feedback:manage', 'integrations:send'] }])
          if (/^\/v1\/projects\/[^/]+\/export$/.test(p)) return send(res, 200, { project: project.publicKey, comments: [] })
          const draft = p.match(/^\/v1\/comments\/[^/]+\/external-work$/)
          if (draft) {
            const provider = url.searchParams.get('provider') ?? 'github'
            return send(res, 200, { provider, connected: false, destination: null, existing: null, draft: { title: '', body: '' } })
          }
          const tracker = p.match(/^\/v1\/projects\/[^/]+\/integrations\/(linear|jira)$/)
          if (tracker) return send(res, 200, { provider: tracker[1], connected: false, destinations: [] })
        }
        if (p === '/mcp/oauth/connections') return send(res, 200, { connections: [] })
        if (method === 'PATCH' && /^\/v1\/projects\/[^/]+$/.test(p)) {
          const body = await readJson(req)
          return send(res, 200, { ...project, ...body, updatedAt: new Date().toISOString() })
        }
        const status = p.match(/^\/v1\/comments\/([^/]+)\/(review-status|implementation-status)$/)
        if (status && method === 'PATCH') {
          const body = await readJson(req)
          log(`PATCH ${status[1]} ${status[2]}`)
          return send(res, 200, { id: status[1], ...body, updatedAt: new Date().toISOString() })
        }
        if (url.pathname === '/__mock/state') return send(res, 200, rows)
        if (url.pathname === '/__mock/stats') {
          return send(res, 200, { count: rows.length, accepted: rows.filter((r) => r.reviewStatus === 'accepted').length, ...stats })
        }
        if (url.pathname === '/__mock/reset') { rows = seed.map((c) => ({ ...c, pageUrl: '' })); nextId = 1; stats.approvals = 0; stats.deletes = 0; return send(res, 204) }

        log(`${method} ${url.pathname} -> 404 (not mocked)`)
        return send(res, 404, { error: 'Not mocked' })
      }
  }
}
