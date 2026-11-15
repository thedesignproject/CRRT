import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, methodNotAllowed } from '../../_lib/http.js'
import { DocumentError, executeDocument } from '../../_lib/documents.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])
  const actor = req.headers.authorization ? await requireUser(req, res) : null
  if (req.headers.authorization && !actor) return
  try {
    return res.status(200).json(await executeDocument(req.body, actor))
  } catch (error) {
    return res
      .status(error instanceof DocumentError ? error.status : error instanceof z.ZodError ? 400 : 503)
      .json({ error: error instanceof DocumentError ? error.message : error instanceof z.ZodError ? 'invalid_request' : 'document_unavailable' })
  }
}
