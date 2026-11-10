import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import { getServiceSupabase } from '../supabase.js'
import type { Failure, Manifest, RecordingState } from './contracts.js'

export class RecordError extends Error {
  constructor(public code: string, public status: number, public retryable = false) { super(code) }
}
export type RecordingRow = {
  id: string; owner_id: string; project_key: string | null; client_key: string; share_hash: string;
  title: string; source: 'tab' | 'window' | 'screen'; state: RecordingState; duration_ms: number | null;
  manifest_hash: string | null; manifest: Manifest | null; consent: { hostedTranscription: boolean; provider: string; policyVersion: string; language: string };
  failure: Failure | null; created_at: string; updated_at: string; deleted_at: string | null; cleaned_at: string | null;
  revision: number; reserved_bytes: number;
  storage_prefix: string;
  media_metadata?: { width: number; height: number; durationMs: number } | null;
}
export const database = getServiceSupabase
export function digest(value: string | Uint8Array) { return createHash('sha256').update(value).digest('hex') }
// Canonical JSON makes retries independent of property insertion order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new RecordError('record_invalid', 400)
  return result.data
}
export function limit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new RecordError('record_configuration', 503)
  return value
}
export function initialShare(id: string, clientKey: string) {
  const secret = process.env.SHARE_TOKEN_SECRET
  if (!secret || secret.length < 24) throw new RecordError('record_configuration', 503)
  return createHmac('sha256', secret).update(`record.v1:${id}:${clientKey}`).digest('base64url')
}
export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    const code = result.error.message === 'forbidden' ? 'record_forbidden' : result.error.message
    const statuses: Record<string, number> = { record_not_found: 404, record_forbidden: 403, record_conflict: 409, record_quota: 429, record_upload_incomplete: 409, record_artifact_mismatch: 409, record_invalid: 400, record_upgrade_required: 402 }
    if (code in statuses) throw new RecordError(code, statuses[code])
    throw new RecordError('record_unavailable', 503, true)
  }
  return result.data
}
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return checked(await database().rpc(name, args)) as T
}
/** Each query must supply a stable, unique ordering. Stay below REST row caps. */
export async function allPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; ; offset += 500) {
    const rows = checked(await query(offset, offset + 499))
    if (!rows) throw new RecordError('record_unavailable', 503, true)
    result.push(...rows)
    if (rows.length < 500) return result
  }
}
export async function owned(actor: string, id: string): Promise<RecordingRow> {
  const row = checked(await database().from('recordings').select('*').eq('id', id).eq('owner_id', actor).is('deleted_at', null).maybeSingle())
  if (!row) throw new RecordError('record_not_found', 404)
  return row as RecordingRow
}
export function summary(row: RecordingRow) {
  return { version: 'record.v1', id: row.id, title: row.title, source: row.source, state: row.state,
    projectKey: row.project_key, durationMs: row.duration_ms, failure: row.failure,
    authorId: row.owner_id, markCount: row.manifest?.events.filter(event => event.kind === 'mark').length || 0, mediaMetadata: row.media_metadata,
    createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision }
}
export async function command(actor: string, id: string, action: string, input: unknown): Promise<RecordingRow> {
  return rpc('record_command', { p_actor: actor, p_id: id, p_action: action, p_input: input })
}
