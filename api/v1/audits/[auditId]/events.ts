import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { auditEventsResponseSchema } from '../../../../shared/product-audit/contracts.js'
import { requireAuditAccess } from '../../../_lib/audits/access.js'
import { listAuditEvents } from '../../../_lib/audits/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'

const METHODS = ['GET', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  const auditId = getStringQuery(req.query.auditId)
  const after = getStringQuery(req.query.after) || '0'
  const limitValue = Number(getStringQuery(req.query.limit) || '50')
  if (!auditId || !z.uuid().safeParse(auditId).success) return jsonError(req, res, 400, 'Invalid auditId')
  if (!/^\d+$/.test(after) || !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
    return jsonError(req, res, 400, 'Invalid event cursor')
  }
  try {
    if (!(await requireAuditAccess(req, res, auditId))) return
    const response = auditEventsResponseSchema.parse(await listAuditEvents(auditId, after, limitValue))
    setCors(req, res, METHODS)
    return res.status(200).json(response)
  } catch {
    return jsonError(req, res, 500, 'Audit events read failed')
  }
}
