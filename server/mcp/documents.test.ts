// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../api/_lib/documents.js', async original => ({ ...await original<object>(), executeDocument: vi.fn() }))
import { executeDocument, DocumentError } from '../../api/_lib/documents.js'
import { documentTools } from './documents.js'
import { ALL_SCOPES, normalizeScope } from './auth.js'
import { tools } from './tools.js'
const id = randomUUID(), key = randomUUID()
const actor = { user_id: randomUUID(), email: 'a@test.local', connection_id: randomUUID(), scope: ALL_SCOPES }
beforeEach(() => { vi.mocked(executeDocument).mockReset(); vi.stubEnv('APP_URL','http://127.0.0.1:5173'); vi.stubEnv('MCP_DASHBOARD_URL',undefined); vi.stubEnv('MCP_ORIGIN','http://127.0.0.1:3001') })
afterEach(() => vi.unstubAllEnvs())
it('registers the full lifecycle and preserves explicit scope grants', () => {
  expect(documentTools).toHaveLength(18)
  for (const tool of documentTools) expect(tools).toContain(tool)
  expect(normalizeScope('crrt:read crrt:dashboard')).toBe(ALL_SCOPES)
  expect(() => normalizeScope('crrt:read crrt:documents:read')).toThrow('invalid_scope')
  for (const tool of documentTools) expect(tool.scope).toBe('crrt:dashboard')
})
it('routes each tool through the shared service and rejects missing mutation scopes', async () => {
  for (const tool of documentTools.filter(t => t.name !== 'create_document' && t.name !== 'unlock_document')) {
    vi.mocked(executeDocument).mockResolvedValue({ id })
    expect(await tool.run({ id },actor)).toEqual({ id })
    expect(executeDocument).toHaveBeenLastCalledWith(expect.objectContaining({ id, action: expect.any(String) }),{ userId: actor.user_id, email: actor.email, mcpConnectionId: actor.connection_id })
    if (tool.scope) await expect(tool.run({ id },{ ...actor, scope: 'crrt:read' })).rejects.toMatchObject({ code: 'insufficient_scope' })
  }
})
it('creates a draft and returns its correctly based share URL', async () => {
  const create = documentTools.find(t => t.name === 'create_document')!
  for (const base of [undefined,'http://127.0.0.1:5173/dashboard/mcp-auth']) {
    vi.stubEnv('MCP_DASHBOARD_URL',base)
    vi.mocked(executeDocument).mockResolvedValueOnce({ id }).mockResolvedValueOnce({ document: { shareKey: key } as never })
    expect(await create.run({ id },actor)).toEqual({ id, shareUrl: `http://127.0.0.1:5173/dashboard/doc/${key}`, sharing: false })
  }
  vi.stubEnv('APP_URL',undefined)
  vi.mocked(executeDocument).mockResolvedValueOnce({ id }).mockResolvedValueOnce({ document: { shareKey: key } as never })
  expect((await create.run({ id },actor)).shareUrl).toContain(key)
})
it('maps shared errors and leaves schema errors visible to transport validation', async () => {
  const tool = documentTools[0]
  vi.mocked(executeDocument).mockRejectedValueOnce(new DocumentError(409,'version_conflict'))
  await expect(tool.run({},actor)).rejects.toMatchObject({ code: 'version_conflict',status:409 })
  vi.mocked(executeDocument).mockRejectedValueOnce(new Error('validation'))
  await expect(tool.run({},actor)).rejects.toThrow('validation')
})
it('resolves preview create URLs before mutation and reports operation-specific tool hints',async()=>{
  vi.stubEnv('APP_URL',undefined);vi.stubEnv('MCP_ORIGIN',undefined);vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_URL','documents-preview.vercel.app')
  const create=documentTools.find(t=>t.name==='create_document')!
  vi.mocked(executeDocument).mockResolvedValueOnce({id}).mockResolvedValueOnce({document:{shareKey:key} as never})
  expect((await create.run({id},actor)).shareUrl).toBe('https://documents-preview.vercel.app/dashboard/doc/'+key)
  vi.mocked(executeDocument).mockClear();vi.stubEnv('APP_URL','invalid')
  await expect(create.run({id},actor)).rejects.toThrow();expect(executeDocument).not.toHaveBeenCalled()
  for(const tool of documentTools){expect(tool.scope).toBe('crrt:dashboard');expect(tool.maxResultBytes).toBe(16777216)}
  expect(documentTools.find(t=>t.name==='get_document')).toMatchObject({annotations:{readOnlyHint:true,destructiveHint:false}})
  for(const name of ['update_document','restore_document_revision'])expect(documentTools.find(t=>t.name===name)).toMatchObject({annotations:{readOnlyHint:false,destructiveHint:true}})
})
