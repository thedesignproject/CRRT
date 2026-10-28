// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { audit } from './audit.js'
import { McpError } from './auth.js'
afterEach(() => vi.restoreAllMocks())
it('records only request metadata and authorized result counts', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  const actor = { user_id: 'user', email: 'private email', connection_id: 'connection' }
  const cases = [
    { projects: [{ body: 'private body' }] }, { feedback: [{ body: 'private body' }] },
    { projectId: 'project', feedback: [{ body: 'private body' }, {}] },
    { feedback: { projectId: 'project', body: 'private body' } },
    { project: { id: 'project' }, pages: [{ feedback: [{ body: 'private body' }] }, { feedback: [{}] }] }, {},
    { projectId: 'project', feedbackIds: ['private id', 'private id'] }, { projectId: 'project', feedbackId: 'private id' },
  ]
  for (const payload of cases) audit('request', 'read', actor, Date.now(), payload)
  audit('request', 'transport', undefined, Date.now(), undefined, new McpError(409, 'ambiguous_project: private project names'))
  audit('request', 'read', actor, Date.now(), undefined, new Error('private secret'))
  expect(log.mock.calls.map(([line]) => JSON.parse(line).resultCount)).toEqual([1, 1, 2, 1, 2, 0, 2, 1, 0, 0])
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|connection/)
  expect(JSON.parse(log.mock.calls[8][0])).toMatchObject({ failureCategory: 'ambiguous_project', userId: null })
})
