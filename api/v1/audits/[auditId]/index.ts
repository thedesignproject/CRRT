import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { auditRunResponseSchema } from '../../../../shared/product-audit/contracts.js'
import { requireAuditAccess } from '../../../_lib/audits/access.js'
import { getAuditResponse } from '../../../_lib/audits/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['GET', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const auditId = getStringQuery(req.query.auditId)
  if (!auditId || !z.uuid().safeParse(auditId).success) return jsonError(req, res, 400, 'Invalid auditId')
  try {
    if (!(await requireAuditAccess(req, res, auditId))) return
    const audit = await getAuditResponse(auditId)
    if (!audit) return jsonError(req, res, 404, 'Audit not found')
    const response = auditRunResponseSchema.parse(audit)
    setCors(req, res, METHODS)
    return res.status(200).json(response)
  } catch {
    return jsonError(req, res, 500, 'Audit read failed')
  }
}
