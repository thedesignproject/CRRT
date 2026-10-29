import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import type { VercelRequest } from '@vercel/node'
import { getServiceSupabase } from './supabase.js'

export class TranscriptionLimitError extends Error {
  constructor(public readonly status: 429 | 503, message: string) { super(message) }
}
const unavailable = () => new TranscriptionLimitError(503, 'Recording transcription quota is unavailable.')
function limit(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw unavailable()
  return value
}
export async function reserveTranscription(req: VercelRequest, bytes: number) {
  // Vercel overwrites X-Forwarded-For at ingress. Other runtimes must use
  // their socket peer; arbitrary forwarding headers/Origin are not identity.
  const address = process.env.VERCEL === '1' ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress
  if (typeof address !== 'string' || !isIP(address.trim()) || address.includes('%')) throw unavailable()
  return reserveIdentity(ipaddr.process(address.trim()).toNormalizedString(), bytes)
}
// Owners cannot reset their allowance by creating or retrying recordings.
// Both entry points share the same atomic global budget in the existing RPC.
export async function reserveRecordingTranscription(owner: string, bytes: number) {
  if (!owner) throw unavailable()
  return reserveIdentity(`owner:${owner}`, bytes)
}
async function reserveIdentity(client: string, bytes: number) {
  const secret = process.env.SHARE_TOKEN_SECRET
  if (!secret || secret.length < 24) throw unavailable()
  const identity = createHmac('sha256', secret).update(`record-transcription:v1:${client}`).digest('hex')
  const args = { p_client: identity, p_bytes: bytes,
    p_client_requests: limit('RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR', 6, 2_147_483_647),
    p_client_bytes: limit('RECORD_TRANSCRIPTION_CLIENT_BYTES_PER_HOUR', 16_777_216),
    p_global_requests: limit('RECORD_TRANSCRIPTION_GLOBAL_REQUESTS_PER_DAY', 100, 2_147_483_647),
    p_global_bytes: limit('RECORD_TRANSCRIPTION_GLOBAL_BYTES_PER_DAY', 134_217_728) }
  let result: { data: unknown; error: unknown }
  try { result = await getServiceSupabase().rpc('reserve_record_transcription', args) } catch { throw unavailable() }
  if (result.error || typeof result.data !== 'boolean') throw unavailable()
  if (!result.data) throw new TranscriptionLimitError(429, 'Recording transcription limit reached. Try again later.')
}
