// @vitest-environment node
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../../api/_lib/store.js', () => ({ listProjectsForUser: vi.fn(), getProjectMember: vi.fn(), listProjectComments: vi.fn() }))
vi.mock('./auth.js', async original => ({ ...await original<object>(), identity: vi.fn(), reserve: vi.fn().mockResolvedValue(undefined) }))
import { getProjectMember, listProjectComments, listProjectsForUser } from '../../api/_lib/store.js'
import { identity } from './auth.js'
import { mcpHandler } from './transport.js'
import { tools as discoveryTools } from './tools.js'
const actor = { user_id: 'user', email: 'a@test.local', connection_id: 'connection' }
const item = { id: '11111111-1111-4111-8111-111111111111', projectId: 'project', body: 'feedback', pageUrl: 'https://app.test/page', authorName: 'Reviewer', reviewStatus: 'accepted', implementationStatus: 'unassigned', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const project = (key: string, name = 'Acme', readable = true) => ({ publicKey: key, name, capabilities: readable ? ['feedback:read'] : [] })
let client: Client
beforeEach(async () => {
  vi.stubEnv('MCP_ORIGIN', 'http://127.0.0.1:3001')
  vi.mocked(identity).mockResolvedValue(actor)
  vi.mocked(listProjectsForUser).mockReset().mockResolvedValue([])
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'member', feedbackAllowed: true })
  vi.mocked(listProjectComments).mockReset().mockResolvedValue([])
  const handler = mcpHandler(discoveryTools)
  client = new Client({ name: 'feedback-test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/api/mcp/v1'), { fetch: async (url, init) => handler(new Request(url, init)) }))
})
afterEach(async () => { await client.close(); vi.unstubAllEnvs() })
const call = async (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args })
it('lists accessible project choices and paginates with user/filter-bound cursors', async () => {
  expect((await call('list_projects')).structuredContent).toMatchObject({ projects: [], nextCursor: null })
  vi.mocked(listProjectsForUser).mockResolvedValueOnce([project('c'), project('b'), project('a', 'Acme', false)] as never)
  const result = (await call('list_projects', { limit: 2 })).structuredContent! as Record<string, unknown>
  expect(result.projects).toEqual([{ id: 'a', name: 'Acme', feedbackReadable: false }, { id: 'b', name: 'Acme', feedbackReadable: true }])
  expect(result.nextCursor).toBeTypeOf('string')
  await call('list_projects', { limit: 2, cursor: result.nextCursor })
  expect(listProjectsForUser).toHaveBeenLastCalledWith('user', { after: 'b', limit: 3 })
  expect((await call('list_projects', { name: 'different', cursor: result.nextCursor })).isError).toBe(true)
  expect((await call('list_projects', { cursor: 'not a cursor' })).isError).toBe(true)
  expect((await call('list_projects', { limit: 51 })).isError).toBe(true)
  vi.mocked(listProjectsForUser).mockResolvedValueOnce([project('a'), project('b')] as never)
  expect((await call('list_projects')).isError).not.toBe(true)
})
it('resolves exact names and returns choices instead of selecting ambiguous projects', async () => {
  vi.mocked(listProjectsForUser).mockResolvedValueOnce([project('a'), project('b')] as never)
  expect(JSON.stringify(await call('list_feedback', { project: { name: 'Acme' } }))).toContain('ambiguous_project')
  expect(listProjectComments).not.toHaveBeenCalled()
  expect((await call('list_feedback', { project: { name: 'unknown' } })).isError).toBe(true)
  vi.mocked(listProjectsForUser).mockResolvedValueOnce([project('project')] as never)
  expect((await call('list_feedback', { project: { name: 'Acme' } })).structuredContent).toMatchObject({ projectId: 'project', feedback: [] })
})
it('enforces current membership, feedback capability, and guest visibility on every call', async () => {
  for (const member of [null, { role: 'member', feedbackAllowed: false }]) {
    vi.mocked(getProjectMember).mockResolvedValueOnce(member as never)
    expect(JSON.stringify(await call('list_feedback', { project: { id: 'private' } }))).toContain('forbidden')
  }
  expect(listProjectComments).not.toHaveBeenCalled()
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'guest' })
  await call('list_feedback', { project: { id: 'project' } })
  expect(listProjectComments).toHaveBeenLastCalledWith('project', expect.objectContaining({ visibility: 'shared', actorUserId: 'user', includeExternalWork: false }))
})
it('passes combined filters to authorized bounded reads and returns summaries with stable pagination', async () => {
  vi.mocked(listProjectComments).mockResolvedValueOnce([item, { ...item, body: 'x'.repeat(600) }] as never)
  const filters = { project: { id: 'project' }, limit: 1, reviewStatus: 'accepted', implementationStatus: 'unassigned', pageUrl: item.pageUrl }
  const page = (await call('list_feedback', filters)).structuredContent! as Record<string, unknown>
  expect(page.feedback).toEqual([expect.objectContaining({ body: 'feedback', bodyTruncated: false })])
  expect(listProjectComments).toHaveBeenLastCalledWith('project', expect.objectContaining({ reviewStatus: 'accepted', implementationStatus: 'unassigned', pageUrl: item.pageUrl, limit: 2 }))
  vi.mocked(listProjectComments).mockResolvedValueOnce([{ ...item, body: 'x'.repeat(600) }] as never)
  expect((await call('list_feedback', { ...filters, cursor: page.nextCursor })).structuredContent).toMatchObject({ feedback: [expect.objectContaining({ bodyTruncated: true, body: 'x'.repeat(512) })], nextCursor: null })
  expect(listProjectComments).toHaveBeenLastCalledWith('project', expect.objectContaining({ cursor: { createdAt: item.createdAt, id: item.id } }))
  expect((await call('list_feedback', { ...filters, reviewStatus: 'open', cursor: page.nextCursor })).isError).toBe(true)
  expect((await call('list_feedback', { project: { id: 'project', name: 'Acme' } })).isError).toBe(true)
})

it('never returns URL query credentials through feedback discovery', async () => {
  vi.mocked(listProjectComments).mockResolvedValueOnce([{ ...item, pageUrl: 'https://app.test/callback?code=secret&signature=secret&customCredential=secret#secret' }] as never)
  const result = await call('list_feedback', { project: { id: 'project' } })
  expect(result.structuredContent).toMatchObject({ feedback: [{ pageUrl: 'https://app.test/callback' }] })
  expect(JSON.stringify(result)).not.toContain('secret')
})

it('filters Ready for Agent without including testing or completed items', async () => {
  await call('list_feedback', { project: { id: 'project' }, readyForAgent: true })
  expect(listProjectComments).toHaveBeenLastCalledWith('project', expect.objectContaining({ readyForAgent: true, reviewStatus: 'accepted' }))
  for (const filters of [{ reviewStatus: 'open' }, { implementationStatus: 'done' }, { implementationStatus: 'ready_for_testing' }]) {
    expect(JSON.stringify(await call('list_feedback', { project: { id: 'project' }, readyForAgent: true, ...filters }))).toContain('conflicting_filters')
  }
})
