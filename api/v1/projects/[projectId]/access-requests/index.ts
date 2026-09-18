import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../../../_lib/auth.js'
import { accessErrors, listAccessRequests, submitAccessRequest } from '../../../../_lib/project-access-requests.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'

import { scheduleAccessRequestEmail } from '../../../../_lib/project-access-email.js'

const METHODS = ['GET', 'POST', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const project = getStringQuery(req.query.projectId)
  if (!project) return jsonError(req, res, 400, 'Missing projectId')
  try {
    if (req.method === 'GET') {
      if (!await requireProjectCapability(req, res, user, project, 'project:manage')) return
      const requests = await listAccessRequests(project)
      setCors(req, res, METHODS)
      return res.status(200).json(requests)
    }
    const result = await submitAccessRequest(project, user.userId)
    const failure = accessErrors[result.outcome]
    if (failure) return jsonError(req, res, ...failure)
    if (!result.request) throw new Error('Missing access request')
    if (result.outcome === 'created') scheduleAccessRequestEmail(result.request)
    setCors(req, res, METHODS)
    return res.status(result.outcome === 'created' ? 201 : 200).json(result.request)
  } catch (error) {
    console.error('Access request failed', error)
    return jsonError(req, res, 500, 'Unable to load or submit access request')
  }
}
