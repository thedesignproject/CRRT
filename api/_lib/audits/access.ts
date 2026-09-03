import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectMembership, requireUser } from '../auth.js'
import { jsonError } from '../http.js'
import { auditLocalAccess } from './config.js'
import { getAuditAccessRow } from './store.js'
import { hashAuditCapability } from './tokens.js'

export async function requireAuditAccess(req: VercelRequest, res: VercelResponse, auditId: string) {
  const row = await getAuditAccessRow(auditId)
  if (!row) {
    jsonError(req, res, 404, 'Audit not found')
    return null
  }

  if (row.owner_kind === 'project') {
    if (typeof req.headers.authorization !== 'string' || !req.headers.authorization.startsWith('Bearer ')) {
      jsonError(req, res, 401, 'Unauthorized')
      return null
    }
    const user = await requireUser(req, res)
    if (!user) return null
    if (!row.project_key || !(await requireProjectMembership(req, res, user, row.project_key))) return null
    return row
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    jsonError(req, res, 410, 'Audit expired')
    return null
  }
  if (auditLocalAccess()) return row
  const presented = req.headers['x-audit-token']
  const token = Array.isArray(presented) ? presented[0] : presented
  if (!token || hashAuditCapability(token) !== row.capability_token_hash) {
    jsonError(req, res, 401, 'Unauthorized')
    return null
  }
  return row
}
