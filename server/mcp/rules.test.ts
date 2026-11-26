// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../api/_lib/store.js', () => ({ getProjectMember: vi.fn(), listBrainRulesFor: vi.fn() }))
import { getProjectMember, listBrainRulesFor } from '../../api/_lib/store.js'
import { tools } from './tools.js'

const actor = { user_id: 'user', email: 'a@test.local', connection_id: 'connection' }
const rule = { id: '11111111-1111-4111-8111-111111111111', title: 'T', body: 'B', projectKey: null, authorUserId: null, createdAt: 'c', updatedAt: 'd' }
const run = (name: string, input: Record<string, unknown>) => tools.find(tool => tool.name === name)!.run(input, actor)

beforeEach(() => {
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'guest', feedbackAllowed: true })
  vi.mocked(listBrainRulesFor).mockReset().mockResolvedValue([rule])
})

it('registers both rule tools as read-only tools every connection gets', () => {
  for (const name of ['list_rules', 'get_rule']) expect(tools.find(tool => tool.name === name)?.scope).toBeUndefined()
})

it('lists the rules applying to a project the actor can read', async () => {
  expect(await run('list_rules', { projectKey: 'p' })).toEqual({ contractVersion: '1', projectKey: 'p', rules: [rule] })
  expect(getProjectMember).toHaveBeenCalledWith('user', 'p')
  expect(listBrainRulesFor).toHaveBeenCalledWith('user', 'p')
})

it('refuses projects the actor cannot read', async () => {
  vi.mocked(getProjectMember).mockResolvedValueOnce(null)
  await expect(run('list_rules', { projectKey: 'p' })).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member', feedbackAllowed: false })
  await expect(run('list_rules', { projectKey: 'p' })).rejects.toMatchObject({ code: 'forbidden' })
  await expect(run('list_rules', {})).rejects.toThrow()
  expect(listBrainRulesFor).not.toHaveBeenCalled()
})

it('gets a rule only when it applies to a project the actor can read', async () => {
  expect(await run('get_rule', { ruleId: rule.id })).toEqual({ contractVersion: '1', rule })
  expect(listBrainRulesFor).toHaveBeenCalledWith('user', null, rule.id)
  vi.mocked(listBrainRulesFor).mockResolvedValueOnce([])
  await expect(run('get_rule', { ruleId: rule.id })).rejects.toMatchObject({ status: 404, code: 'rule_not_found' })
  await expect(run('get_rule', { ruleId: 'nope' })).rejects.toThrow()
})
