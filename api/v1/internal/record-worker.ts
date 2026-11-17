import type { VercelRequest, VercelResponse } from '@vercel/node'
import { firstHeaderValue } from '../../_lib/http.js'
import { dispatchRecordWorker } from '../../_lib/record/worker-dispatch.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'Worker unavailable' })
  if (firstHeaderValue(req.headers.authorization) !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'Unauthorized' })
  if (process.env.CRRT_RECORD_ENABLED !== 'true') return res.status(204).end()
  try {
    await dispatchRecordWorker()
    return res.status(204).end()
  } catch {
    return res.status(503).json({ error: 'Worker unavailable' })
  }
}
