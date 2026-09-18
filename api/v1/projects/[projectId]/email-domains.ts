import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser, requireProjectCapability } from '../../../_lib/auth.js'
import { addEmailDomain, listEmailDomains, normalizeEmailDomain, removeEmailDomain } from '../../../_lib/domain-access.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['GET', 'POST', 'DELETE', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return
  const project = getStringQuery(req.query.projectId)
  if (!project) return jsonError(req, res, 400, 'Missing projectId')
  if (!await requireProjectCapability(req, res, user, project, 'project:manage')) return
  try {
    if (req.method !== 'GET') {
      const domain = normalizeEmailDomain(req.method === 'DELETE' ? req.query.domain : req.body?.domain)
      if (!domain) return jsonError(req, res, 400, 'Enter a valid email domain, such as company.com')
      let outcome: 'updated' | 'forbidden'
      if (req.method === 'POST') outcome = await addEmailDomain(project, user.userId, domain)
      else outcome = await removeEmailDomain(project, user.userId, domain)
      if (outcome === 'forbidden') return jsonError(req, res, 403, 'Project admin access required')
    }
    const domains = await listEmailDomains(project)
    setCors(req, res, METHODS)
    return res.status(200).json(domains)
  } catch (error) {
    console.error('Project email domains failed', error)
    return jsonError(req, res, 500, 'Unable to update or load email domains')
  }
}
