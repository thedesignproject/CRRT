import type { VercelRequest, VercelResponse } from '@vercel/node'
import { auditCapabilitiesSchema } from '../../../shared/product-audit/contracts.js'
import { auditCapabilities } from '../../_lib/audits/config.js'
import { handleOptions, methodNotAllowed, setCors } from '../../_lib/http.js'

const METHODS = ['GET', 'OPTIONS']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, METHODS)
  setCors(req, res, METHODS)
  return res.status(200).json(auditCapabilitiesSchema.parse(auditCapabilities()))
}
