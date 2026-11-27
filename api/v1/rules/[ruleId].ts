import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { canProject, effectiveProjectRole } from '../../_lib/project-capabilities.js'
import { deleteBrainRule, getBrainRuleScope, getProjectMember, updateBrainRule } from '../../_lib/store.js'
import { RULE_TEXT_ERROR, ruleText } from './index.js'

const METHODS = ['PATCH', 'DELETE', 'OPTIONS']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const ruleId = getStringQuery(req.query.ruleId)
  if (!ruleId || !UUID_RE.test(ruleId)) return jsonError(req, res, 404, 'Rule not found')

  const patch: { title?: string; body?: string } = {}
  if (req.method === 'PATCH') {
    for (const [key, max] of [['title', 120], ['body', 4000]] as const) {
      if (req.body?.[key] === undefined) continue
      const text = ruleText(req.body[key], max)
      if (!text) return jsonError(req, res, 400, RULE_TEXT_ERROR)
      patch[key] = text
    }
    if (!patch.title && !patch.body) return jsonError(req, res, 400, RULE_TEXT_ERROR)
  }

  try {
    // Visible: your own workspace rule, or a rule of a project whose feedback you may read.
    // Editable: workspace rules by their owner, project rules with project:manage.
    const scope = await getBrainRuleScope(ruleId)
    let editable = scope?.ownerUserId === user.userId
    if (scope?.projectKey) {
      const membership = await getProjectMember(user.userId, scope.projectKey)
      editable = !!membership && canProject(effectiveProjectRole(membership.role, membership.isOwner), 'project:manage')
      if (!editable && membership && membership.feedbackAllowed !== false) return jsonError(req, res, 403, 'Forbidden')
    }
    if (!editable) return jsonError(req, res, 404, 'Rule not found')
    setCors(req, res, METHODS)
    if (req.method === 'DELETE') {
      await deleteBrainRule(ruleId)
      return res.status(204).end()
    }
    return res.status(200).json({ rule: await updateBrainRule(ruleId, patch) })
  } catch (error) {
    console.error('Brain rule update failed', error)
    return jsonError(req, res, 500, 'Unable to update the rule')
  }
}
