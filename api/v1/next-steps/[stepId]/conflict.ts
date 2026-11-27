import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../_lib/auth.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
import { canProject, effectiveProjectRole } from '../../../_lib/project-capabilities.js'
import { answerNextStepConflict, getNextStep, getProjectMember, listNextSteps } from '../../../_lib/store.js'

const METHODS = ['POST', 'OPTIONS']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The user's answer to a rule conflict an agent paused on: keep the rule or update it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const stepId = getStringQuery(req.query.stepId)
  if (!stepId || !UUID_RE.test(stepId)) return jsonError(req, res, 404, 'Next step not found')
  const decision = req.body?.decision
  if (decision !== 'keep_rule' && decision !== 'update_rule') return jsonError(req, res, 400, 'decision must be keep_rule or update_rule')

  try {
    const found = await getNextStep(stepId)
    const membership = found && await getProjectMember(user.userId, found.projectKey)
    if (!found || !membership || membership.feedbackAllowed === false) return jsonError(req, res, 404, 'Next step not found')
    if (!canProject(effectiveProjectRole(membership.role, membership.isOwner), 'agent:operate')) return jsonError(req, res, 403, 'Forbidden')
    const step = (await listNextSteps(found.projectKey)).find((item) => item.id === stepId)
    if (step?.status !== 'paused' || !(await answerNextStepConflict(stepId, decision))) {
      return jsonError(req, res, 409, 'This step is not waiting for an answer')
    }
    setCors(req, res, METHODS)
    return res.status(200).json({ step: { ...step, status: 'open', conflict: { ...step.conflict!, decision } } })
  } catch (error) {
    console.error('Next step conflict answer failed', error)
    return jsonError(req, res, 500, 'Unable to save the answer')
  }
}
