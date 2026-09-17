import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../../../_lib/auth.js'
import { accessErrors, reviewAccessRequest } from '../../../../_lib/project-access-requests.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

const METHODS = ['PATCH', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'PATCH') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const project = getStringQuery(req.query.projectId)
  const requestId = getStringQuery(req.query.requestId)
  if (!project || !requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return jsonError(req, res, 400, 'Invalid project or request')
  const attempt = req.body?.attempt
  if (!Number.isSafeInteger(attempt) || attempt < 1) return jsonError(req, res, 400, 'Invalid request attempt')
  const decision = req.body?.decision
  const role = req.body?.role ?? 'member'
  if ((decision !== 'approved' && decision !== 'declined') || !['member', 'admin', 'guest'].includes(role)) return jsonError(req, res, 400, 'Invalid decision or role')
  try {
    // The RPC checks current project:manage permission inside the same transaction.
    const result = await reviewAccessRequest(project, requestId, user.userId, attempt, decision, role)
    const failure = accessErrors[result.outcome]
    if (failure) return jsonError(req, res, ...failure)
    if (!result.request) throw new Error('Missing access request')
    setCors(req, res, METHODS)
    return res.status(200).json(result.request)
  } catch (error) {
    console.error('Access review failed', error)
    return jsonError(req, res, 500, 'Unable to review access request')
  }
}
