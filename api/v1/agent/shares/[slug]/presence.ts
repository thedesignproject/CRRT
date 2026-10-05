import { hashToken } from '../../../../_lib/tokens.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAgentId, getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../../../_lib/http.js'
import { writeAgentPresence } from '../../../../_lib/store.js'
import { requireAgentShare } from '../../../../_lib/shares.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['POST', 'OPTIONS'])) return
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST', 'OPTIONS'])

  try {
    const slug = getStringQuery(req.query.slug)
    if (!slug) return jsonError(req, res, 400, 'Missing slug')

    const authorized = await requireAgentShare(req, res, slug)
    if (!authorized) return

    const agentId = getAgentId(req)
    const status = req.body?.status
    const summary = typeof req.body?.summary === 'string' ? req.body.summary : null

    if (!agentId) return jsonError(req, res, 400, 'Missing X-Agent-Id')
    if (typeof status !== 'string' || status.length === 0) {
      return jsonError(req, res, 400, 'Missing presence status')
    }

    await writeAgentPresence(authorized.share.id, hashToken(authorized.token), agentId, status, summary)

    setCors(req, res, ['POST', 'OPTIONS'])
    return res.status(200).json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'share_unavailable') return jsonError(req, res, 410, 'Share unavailable')
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}

