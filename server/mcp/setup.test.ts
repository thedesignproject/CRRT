import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../api/_lib/store.js', () => ({ getProject: vi.fn(), getProjectMember: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ getServiceSupabase: vi.fn() }))
import { getProject, getProjectMember } from '../../api/_lib/store.js'
import { getServiceSupabase } from '../../api/_lib/supabase.js'
import { setupTools } from './setup.js'
const actor = { user_id: 'user', email: 'user@example.test', connection_id: 'connection', scope: 'crrt:read crrt:projects' }
const rpc = vi.fn()
const [status, installation, create] = setupTools
const input = { projectId: 'test-project', name: 'Test', origins: ['https://example.test/page', 'http://localhost:3000', 'https://example.test'] }
beforeEach(() => {
  vi.clearAllMocks(); process.env.MCP_ORIGIN = 'https://crrt.ai'
  vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never)
  vi.mocked(getProjectMember).mockResolvedValue({ role: 'admin', isOwner: true } as never)
  vi.mocked(getProject).mockResolvedValue({ name: 'Test', allowedOrigins: ['example.test'] } as never)
  rpc.mockResolvedValue({ error: null })
})
it('reports only identity and granted scopes without credentials', async () => {
  expect(await status.run({}, actor)).toEqual({ userId: 'user', scopes: ['crrt:read', 'crrt:projects'] })
  expect(await status.run({}, { ...actor, scope: undefined })).toEqual({ userId: 'user', scopes: ['crrt:read'] })
})
it('returns real package configuration and a setup skill for project managers', async () => {
  const result = await installation.run({ projectId: 'test-project' }, actor)
  expect(installation.output.parse(result)).toMatchObject({ packageName: '@thedesignproject/crrt', configuration: { projectId: 'test-project', apiBase: 'https://crrt.ai/api' }, skillUrl: 'https://crrt.ai/agent-skills/setup.md' })
  expect(getProjectMember).toHaveBeenCalledWith('user', 'test-project')
})
it.each([null, { role: 'guest' }, { role: 'member' }])('denies installation for non-managers %#', async member => {
  vi.mocked(getProjectMember).mockResolvedValue(member as never)
  await expect(installation.run({ projectId: 'test-project' }, actor)).rejects.toMatchObject({ code: 'forbidden' })
  expect(getProject).not.toHaveBeenCalled()
})
it('handles deleted projects', async () => {
  vi.mocked(getProject).mockResolvedValue(null)
  await expect(installation.run({ projectId: 'test-project' }, actor)).rejects.toMatchObject({ code: 'project_not_found' })
})
it('creates with normalized explicit origins and the connection-bound transaction', async () => {
  expect(create.scope).toBe('crrt:projects')
  expect(create.output.parse(await create.run(input, actor))).toMatchObject({ projectId: 'test-project' })
  expect(rpc).toHaveBeenCalledWith('mcp_create_project', { p_connection: 'connection', p_actor: 'user', p_project: 'test-project', p_name: 'Test', p_origins: ['example.test', 'localhost'] })
})
it('does not silently broaden existing read or implementation grants', async () => {
  for (const scope of ['crrt:read', 'crrt:read crrt:implement', 'crrt:read crrt:review']) {
    await expect(create.run(input, { ...actor, scope })).rejects.toMatchObject({ code: 'insufficient_scope' })
  }
  expect(rpc).not.toHaveBeenCalled()
})
it.each(['project_key_unavailable', 'project_configuration_conflict', 'insufficient_scope', 'private database details'])('reports safe creation failure %s', async message => {
  rpc.mockResolvedValue({ error: { message } })
  await expect(create.run(input, actor)).rejects.toMatchObject({ code: message === 'private database details' ? 'project_creation_unavailable' : message })
  expect(getProject).not.toHaveBeenCalled()
})
it.each(['file:///tmp/site', 'https://user:pass@example.test', 'https://user@example.test'])('rejects unsafe origin %s', async origin => {
  await expect(create.run({ ...input, origins: [origin] }, actor)).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalled()
})
