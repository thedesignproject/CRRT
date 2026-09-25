import type { VercelRequest, VercelResponse } from '@vercel/node'
import { processCommentEmailQueue } from '../../_lib/comment-email-outbox.js'
import { getCommentActivityEmailTimeoutMs } from '../../_lib/comment-activity-email.js'
import { firstHeaderValue } from '../../_lib/http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'Email worker unavailable' })
  if (firstHeaderValue(req.headers.authorization) !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    await processCommentEmailQueue(getCommentActivityEmailTimeoutMs())
    return res.status(204).end()
  } catch {
    return res.status(503).json({ error: 'Email worker failed' })
  }
}
