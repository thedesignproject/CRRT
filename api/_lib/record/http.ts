import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../auth.js'
import { setCors } from '../http.js'
import { uuid } from './contracts.js'
import { assertRecordEnabled } from './features.js'
import { parse, RecordError } from './core.js'

type Action = (actor: string, req: VercelRequest) => Promise<unknown>
export function ownerEndpoint(actions: Record<string, Action>, withId = true) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    setCors(req, res, [...Object.keys(actions), 'OPTIONS'])
    if (req.method === 'OPTIONS') return res.status(204).end()
    try {
      assertRecordEnabled()
      const action = actions[req.method || '']
      if (!action) return res.status(405).json({ error: { code: 'record_method', retryable: false } })
      const user = await requireUser(req, res)
      if (!user) return
      if (withId) req.query.id = parse(uuid, req.query.id)
      if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body)) > 1_048_576) throw new RecordError('record_payload_too_large', 413)
      const result = await action(user.userId, req)
      return res.status(req.method === 'POST' && !withId ? 201 : 200).json(result)
    } catch (error) {
      const failure = error instanceof RecordError ? error : new RecordError('record_unavailable', 503, true)
      return res.status(failure.status).json({ error: { code: failure.code, retryable: failure.retryable } })
    }
  }
}
