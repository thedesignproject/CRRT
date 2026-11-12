import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors } from '../../_lib/http.js'
import { RecordError } from '../../_lib/record/core.js'
import { readShare } from '../../_lib/record/sharing.js'
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  setCors(req, res, ['GET', 'OPTIONS'])
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (process.env.CRRT_RECORD_ENABLED !== 'true') return res.status(503).json({ error: { code: 'record_disabled', retryable: false } })
  if (req.method !== 'GET') return res.status(405).json({ error: { code: 'record_method', retryable: false } })
  try { return res.status(200).json(await readShare(req.query.token)) } catch (error) {
    const failure = error instanceof RecordError ? error : new RecordError('record_unavailable', 503, true)
    return res.status(failure.status).json({ error: { code: failure.code, retryable: failure.retryable } })
  }
}
