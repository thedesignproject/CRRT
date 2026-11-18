// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
vi.mock('./auth.js', async original => ({ ...await original<object>(), identity: vi.fn(), reserve: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../api/_lib/auth.js', async original => ({ ...await original<object>(), isSuperAdmin: vi.fn() }))
vi.mock('./dashboard-access.js', async original => ({ ...await original<object>(), requestDashboardAccess: vi.fn().mockResolvedValue({ state: 'pending', approvalUrl: 'http://127.0.0.1:3001/dashboard/mcp-auth?upgrade=request' }) }))
import { ALL_SCOPES, identity } from './auth.js'
import { mcpHandler } from './transport.js'
import { isSuperAdmin } from '../../api/_lib/auth.js'
import { tools } from './tools.js'
import { dashboardOperations } from './dashboard-operations.js'

const actor = { user_id: 'user', email: 'a@test.local', connection_id: 'connection', scope: ALL_SCOPES }
beforeEach(() => { vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001'); vi.mocked(identity).mockResolvedValue(actor); vi.mocked(isSuperAdmin).mockReset().mockResolvedValue(true) })
afterEach(() => vi.unstubAllEnvs())
async function connect() {
  const handler = mcpHandler(tools)
  const client = new Client({ name: 'directory-review', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/api/mcp/v1'), { fetch: async (url, init) => handler(new Request(url, init)) }))
  return client
}

it('publishes every tool with a title, explicit annotations and a JSON input schema to a real SDK client', async () => {
  const client = await connect()
  try {
    const listed = (await client.listTools()).tools
    expect(listed.map(tool => tool.name).sort()).toEqual(tools.map(tool => tool.name).sort())
    expect(listed.map(tool => tool.name)).not.toContain('run_dashboard_operation')
    for (const tool of listed) {
      expect(tool.title, tool.name).toBeTruthy()
      expect(tool.inputSchema.type, tool.name).toBe('object')
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) expect(typeof tool.annotations?.[hint], `${tool.name}.${hint}`).toBe('boolean')
    }
    const bulk = listed.find(tool => tool.name === 'bulk_update_inbox_feedback')!
    expect(bulk.inputSchema.required).toEqual(expect.arrayContaining(['operation', 'selection']))
    expect(listed.filter(tool => dashboardOperations.some(operation => operation.tool === tool.name))).toHaveLength(dashboardOperations.length)
  } finally { await client.close() }
})

it('calls an explicit dashboard tool through the SDK and keeps the upgrade path for older grants', async () => {
  vi.mocked(identity).mockResolvedValue({ ...actor, scope: 'crrt:read' })
  const client = await connect()
  try {
    const result = await client.callTool({ name: 'list_dashboard_projects', arguments: {} })
    expect(result.structuredContent).toMatchObject({ ok: false, code: 'permission_upgrade_required', state: 'pending' })
    const rejected = await client.callTool({ name: 'update_project_settings', arguments: { projectId: 'project', name: 'Renamed' } })
    expect(rejected.isError).toBe(true)
  } finally { await client.close() }
})

it('lists super-admin tools only for super-admins and hides them when the role lookup fails', async () => {
  const admin = ['admin_get_stats', 'admin_list_projects', 'admin_list_users']
  const names = async () => { const client = await connect(); try { return (await client.listTools()).tools.map(tool => tool.name) } finally { await client.close() } }
  expect(await names()).toEqual(expect.arrayContaining(admin))
  vi.mocked(isSuperAdmin).mockResolvedValue(false)
  const regular = await names()
  expect(regular.filter(name => admin.includes(name))).toEqual([])
  expect(regular).toContain('get_admin_status')
  vi.mocked(isSuperAdmin).mockRejectedValue(new Error('lookup failed'))
  expect((await names()).filter(name => admin.includes(name))).toEqual([])
  expect(isSuperAdmin).toHaveBeenCalledWith('user')
})
