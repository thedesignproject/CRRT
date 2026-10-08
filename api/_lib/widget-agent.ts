import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors } from './http.js'
import type { WidgetAgentAccessState } from './billing/agent-entitlement.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/

export function parseWidgetAgentSessionRequest(body: unknown, headerKey?: string | string[]) {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const projectKey = typeof input.projectKey === 'string' ? input.projectKey : ''
  const pageUrl = typeof input.pageUrl === 'string' ? input.pageUrl : ''
  const bodyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : ''
  const idempotencyKey = bodyKey || (typeof headerKey === 'string' ? headerKey : '')
  const commentIds = Array.isArray(input.commentIds) ? input.commentIds : []
  if (!projectKey || !pageUrl || !IDEMPOTENCY_KEY.test(idempotencyKey)
    || commentIds.length < 1 || commentIds.length > 100
    || !commentIds.every((id): id is string => typeof id === 'string' && UUID.test(id))
    || new Set(commentIds).size !== commentIds.length) return null
  try { new URL(pageUrl) } catch { return null }
  return { projectKey, pageUrl, idempotencyKey, commentIds }
}

export function widgetAgentRequestHash(input: { projectKey: string; pageUrl: string; commentIds: string[] }) {
  return createHash('sha256').update(JSON.stringify([
    input.projectKey,
    input.pageUrl,
    [...input.commentIds].sort(),
  ])).digest('hex')
}

const ACCESS_ERRORS: Record<Exclude<WidgetAgentAccessState, 'ready'>, { status: number; message: string }> = {
  project_access_denied: { status: 403, message: 'Agent is unavailable for this project' },
  forbidden: { status: 403, message: 'Agent is unavailable for this project' },
  upgrade_required: { status: 402, message: 'Upgrade the project plan to use Agent' },
  owner_upgrade_required: { status: 402, message: 'Ask the project owner to upgrade the plan' },
  seat_limit_reached: { status: 409, message: 'No Agent seats are available' },
}

export function sendWidgetAgentError(
  req: VercelRequest,
  res: VercelResponse,
  code: Exclude<WidgetAgentAccessState, 'ready'> | 'authentication_required' | 'invalid_selection' | 'idempotency_conflict' | 'error',
) {
  setCors(req, res, ['GET', 'POST', 'OPTIONS'])
  if (code === 'authentication_required') return res.status(401).json({ error: 'Sign in to CRRT again', code })
  if (code === 'invalid_selection') return res.status(409).json({ error: 'Feedback changed. Review the selection and retry.', code })
  if (code === 'idempotency_conflict') return res.status(409).json({ error: 'This Agent request key was already used for another selection.', code })
  if (code === 'error') return res.status(500).json({ error: 'Agent is temporarily unavailable', code })
  const failure = ACCESS_ERRORS[code]
  return res.status(failure.status).json({ error: failure.message, code })
}
