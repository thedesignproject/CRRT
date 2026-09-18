import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { auditRunResponseSchema } from '../../../../shared/product-audit/contracts.js'
import { requireAuditAccess } from '../../../_lib/audits/access.js'
import { cancelAuditExecution } from '../../../_lib/audits/execution.js'
import { cancelAudit, getAuditResponse } from '../../../_lib/audits/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['POST', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, METHODS)
  const auditId = getStringQuery(req.query.auditId)
  if (!auditId || !z.uuid().safeParse(auditId).success) return jsonError(req, res, 400, 'Invalid auditId')
  try {
    const row = await requireAuditAccess(req, res, auditId)
    if (!row) return
    await cancelAudit(auditId)
    try { await cancelAuditExecution(row.workflow_run_id || null) } catch { /* persisted cancellation remains authoritative */ }
    const audit = await getAuditResponse(auditId)
    if (!audit) return jsonError(req, res, 404, 'Audit not found')
    setCors(req, res, METHODS)
    return res.status(200).json(auditRunResponseSchema.parse(audit))
  } catch {
    return jsonError(req, res, 500, 'Audit cancellation failed')
  }
}
