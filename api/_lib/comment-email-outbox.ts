import { randomUUID } from 'node:crypto'
import { getServiceSupabase } from './supabase.js'

const TABLE = 'comment_email_batches'
// Resend remembers idempotency keys for 24h. Stop well before that boundary,
// including after a process crash or a long scheduler outage.
const RETRY_WINDOW_MS = 20 * 60 * 60 * 1000
const LEASE_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 8
const WORKER_BUDGET_MS = 7_000

export type EmailBatch = {
  id: string
  delivery_id: string
  batch_index: number
  body: string
  status: string
  attempts: number
  next_attempt_at: string
  expires_at: string
}

export class CommentEmailEnqueueRejectedError extends Error {}

export async function enqueueCommentEmail(deliveryId: string, bodies: string[]) {
  const expiresAt = new Date(Date.now() + RETRY_WINDOW_MS).toISOString()
  // A single INSERT transaction persists all batches before any mail is sent.
  // Re-enqueueing the same delivery never replaces an already frozen payload.
  const snapshot = bodies.map((body, batchIndex) => ({
    delivery_id: deliveryId, batch_index: batchIndex, body, expires_at: expiresAt,
  }))
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 250))
    try {
      const { error } = await getServiceSupabase().from(TABLE).upsert(snapshot,
        { onConflict: 'delivery_id,batch_index', ignoreDuplicates: true })
      if (!error) return
      // A rejection on the first attempt is definitive. After an uncertain
      // attempt, an earlier INSERT could already have committed.
      if (/^(?:22|23|42)[A-Z0-9]{3}$|^(?:4000[012]|40P01|57014|PGRST20[45])$/.test(error.code)) {
        if (attempt === 0) throw new CommentEmailEnqueueRejectedError('Comment email queue rejected the notification')
        break
      }
    } catch (error) {
      if (error instanceof CommentEmailEnqueueRejectedError) throw error
      // Transport exceptions can also hide a successful commit. Retry the
      // same snapshot; the unique delivery/batch key prevents duplicate rows.
    }
  }
  throw new Error('Comment email queue unavailable; enqueue outcome is uncertain')
}

function retryDelay(attempt: number, retryAfter: string | null) {
  const backoff = Math.min(60 * 60 * 1000, 30_000 * 2 ** (attempt - 1))
  if (!retryAfter) return backoff
  const seconds = Number(retryAfter)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
  return Number.isFinite(delay) ? Math.max(backoff, Math.min(RETRY_WINDOW_MS, delay)) : backoff
}

export async function processCommentEmailQueue(timeoutMs = 5_000) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const db = getServiceSupabase()
  const deadline = Date.now() + WORKER_BUDGET_MS
  const now = new Date().toISOString()
  const { data, error } = await db.from(TABLE).select('*')
    .eq('status', 'pending').lte('next_attempt_at', now).order('next_attempt_at').limit(10)
  if (error) throw new Error('Comment email queue read failed')

  for (const batch of data as EmailBatch[]) {
    if (Date.now() >= deadline) break
    const token = randomUUID()
    // Compare-and-swap: concurrent workers cannot claim the same revision.
    // A crashed worker's lease becomes eligible again after two minutes.
    const { data: claimed, error: claimError } = await db.from(TABLE).update({
      lease_token: token, attempts: batch.attempts + 1,
      next_attempt_at: new Date(Date.now() + LEASE_MS).toISOString(),
    }).eq('id', batch.id).eq('status', 'pending').eq('attempts', batch.attempts)
      .eq('next_attempt_at', batch.next_attempt_at).select('id').maybeSingle()
    if (claimError) throw new Error('Comment email queue claim failed')
    if (!claimed) continue

    let status = 'failed'
    let lastError: string | null = 'retry_window_exhausted'
    let delay = 0
    if (Date.now() < Date.parse(batch.expires_at) && batch.attempts < MAX_ATTEMPTS) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, deadline - Date.now())))
      try {
        const response = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST', signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `comment-activity/${batch.delivery_id}/${batch.batch_index}`,
          },
          body: batch.body,
        })
        if (response.ok) {
          status = 'sent'
          lastError = null
        } else {
          lastError = `resend_${response.status}`
          if ([408, 409, 429].includes(response.status) || response.status >= 500) {
            status = 'pending'
            delay = retryDelay(batch.attempts + 1, response.headers.get('retry-after'))
          }
        }
      } catch {
        // The request might have been accepted. Replay exactly the same body
        // and key; never generate a new key after an ambiguous network error.
        status = 'pending'
        lastError = 'network_or_timeout'
        delay = retryDelay(batch.attempts + 1, null)
      } finally {
        clearTimeout(timeout)
      }
      if (status === 'pending' && (batch.attempts + 1 >= MAX_ATTEMPTS || Date.now() + delay >= Date.parse(batch.expires_at))) {
        status = 'failed'
      }
    }
    const { error: updateError } = await db.from(TABLE).update({
      status, last_error: lastError, lease_token: null,
      next_attempt_at: new Date(Date.now() + delay).toISOString(),
    }).eq('id', batch.id).eq('lease_token', token)
    // On failure leave the lease to expire. Its replay uses the original key.
    if (updateError) throw new Error('Comment email queue checkpoint failed')
    if (status === 'failed') console.warn('Comment email delivery failed', { batchId: batch.id, reason: lastError })
  }

  // Limit retention of recipient addresses and rendered message content.
  const { error: cleanupError } = await db.from(TABLE).delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  if (cleanupError) throw new Error('Comment email queue cleanup failed')
}
