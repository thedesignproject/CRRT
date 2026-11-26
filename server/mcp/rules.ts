import { z } from 'zod'
import { listBrainRulesFor } from '../../api/_lib/store.js'
import { access } from './feedback.js'
import { ensure, uuid } from './auth.js'
import type { ToolSpec } from './transport.js'

const ruleSchema = z.object({ id: uuid, title: z.string(), body: z.string(), projectKey: z.string().nullable(), authorUserId: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() }).strict()
const listInput = z.object({ projectKey: z.string().min(1).max(200).describe('Project id from list_projects.') }).strict()
const getInput = z.object({ ruleId: uuid }).strict()

export const ruleTools: ToolSpec[] = [{
  name: 'list_rules', title: 'List rules',
  description: 'Lists the rules your team set for one project you can access: the project\'s own rules (projectKey set) and its owner\'s workspace-wide rules (projectKey null). Read and follow them before working on the project\'s feedback.',
  input: listInput,
  output: z.object({ contractVersion: z.literal('1'), projectKey: z.string(), rules: z.array(ruleSchema) }).strict(),
  async run(raw, actor) {
    const { projectKey } = listInput.parse(raw)
    await access(actor, projectKey)
    return { contractVersion: '1', projectKey, rules: await listBrainRulesFor(actor.user_id, projectKey) }
  },
}, {
  name: 'get_rule', title: 'Get rule',
  description: 'Gets one rule by id, if it applies to a project you can access.',
  input: getInput,
  output: z.object({ contractVersion: z.literal('1'), rule: ruleSchema }).strict(),
  async run(raw, actor) {
    const { ruleId } = getInput.parse(raw)
    const [rule] = await listBrainRulesFor(actor.user_id, null, ruleId)
    ensure(rule, 404, 'rule_not_found')
    return { contractVersion: '1', rule }
  },
}]
