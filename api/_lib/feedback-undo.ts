import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { IMPLEMENTATION_STATUSES } from './status.js'

const receipt = z.object({
  purpose: z.literal('feedback-undo'), actor: z.string(), project: z.string(), id: z.string(),
  reviewStatus: z.enum(['open', 'accepted', 'rejected']),
  implementationStatus: z.enum(IMPLEMENTATION_STATUSES), claimedByAgentId: z.string().nullable(),
  expectedUpdatedAt: z.string(), expires: z.number(),
})
function secret() {
  const key = process.env.WIDGET_AUTH_SECRET
  if (!key) throw new Error('Undo signing is not configured')
  return key
}
function signature(body: string, key: string) { return createHmac('sha256', key).update(body).digest() }

// Prepare before mutation so missing configuration cannot leave an unreported write.
export function prepareFeedbackUndo(actor: string, before: {
  id: string; projectId: string; reviewStatus: 'open' | 'accepted' | 'rejected'
  implementationStatus: typeof IMPLEMENTATION_STATUSES[number]; claimedByAgentId: string | null
}) {
  const key = secret()
  const snapshot = { purpose: 'feedback-undo', actor, project: before.projectId, id: before.id,
    reviewStatus: before.reviewStatus, implementationStatus: before.implementationStatus,
    claimedByAgentId: before.claimedByAgentId, expires: Date.now() + 60 * 60_000 }
  return (expectedUpdatedAt: string) => {
    const body = Buffer.from(JSON.stringify({ ...snapshot, expectedUpdatedAt })).toString('base64url')
    return `${body}.${signature(body, key).toString('base64url')}`
  }
}
export function readFeedbackUndo(token: unknown, actor: string, project: string, id: string) {
  if (typeof token !== 'string' || token.length > 8192) return null
  const key = secret()
  try {
    const [body, mac, extra] = token.split('.')
    if (!body || !mac || extra !== undefined) return null
    const supplied = Buffer.from(mac, 'base64url'), expected = signature(body, key)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
    const value = receipt.parse(JSON.parse(Buffer.from(body, 'base64url').toString()))
    if (value.actor !== actor || value.project !== project || value.id !== id || value.expires <= Date.now()) return null
    return value
  } catch { return null }
}
