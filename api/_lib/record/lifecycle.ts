import { randomUUID } from 'node:crypto'
import { librarySummaries } from './library-previews.js'
import { newRecordingStorage } from './object-storage.js'
import { createSchema, projectSchema, titleSchema, uuid } from './contracts.js'
import { checked, command, database, digest, canonical, initialShare, limit, owned, parse, RecordError, rpc, summary, type RecordingRow } from './core.js'

export async function createRecording(actor: string, body: unknown) {
  const input = parse(createSchema, body)
  const id = randomUUID()
  const token = initialShare(id, input.clientKey)
  const row = await rpc<RecordingRow>('record_create', { p_actor: actor, p_id: id,
    p_input: { ...input, ...newRecordingStorage(), requestHash: digest(canonical(input)), shareHash: digest(token) },
    p_limit: limit('RECORD_MAX_RECORDINGS', 25) })
  const current = initialShare(row.id, row.client_key)
  return { recording: summary(row), shareId: digest(current) === row.share_hash ? current : null }
}
export async function listRecordings(actor: string, query: Record<string, unknown>) {
  const before = query.before === undefined ? null : parse(uuid, query.before)
  // UUID cursors are resolved within the owner's library; no cross-owner cursor leak.
  const cursor = before ? checked(await database().from('recordings').select('id,created_at')
    .eq('id', before).eq('owner_id', actor).maybeSingle()) : null
  if (before && !cursor) throw new RecordError('record_not_found', 404)
  let request = database().from('recordings').select('*').eq('owner_id', actor).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51)
  if (cursor) request = request.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
  const rows = checked(await request) as RecordingRow[]
  return { recordings: await librarySummaries(rows.slice(0, 50)), next: rows.length > 50 ? rows[49].id : null }
}
export async function readRecording(actor: string, id: string) { return { recording: summary(await owned(actor, id)) } }
export async function updateRecording(actor: string, id: string, body: unknown) {
  return { recording: summary(await command(actor, id, 'title', parse(titleSchema, body))) }
}
export async function attachRecording(actor: string, id: string, body: unknown) {
  const input = parse(projectSchema, body)
  if (input.projectKey !== null) {
    const member = checked(await database().from('project_members').select('role,projects(widget_private,feedback_access)')
      .eq('user_id', actor).eq('project_key', input.projectKey).maybeSingle())
    if (!member || !['admin', 'member'].includes(member.role)) throw new RecordError('record_forbidden', 403)
  }
  return { recording: summary(await command(actor, id, 'project', input)) }
}
