import { randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { allPages, checked, database, digest, initialShare, owned, parse, RecordError, summary, type RecordingRow } from './core.js'
import { artifacts, checkPath, RECORD_BUCKET } from './storage.js'

export const shareToken = z.string().regex(/^(?:[A-Za-z0-9_-]{43}|v1\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43})$/)
function currentShare(row: RecordingRow) {
  if (row.share_hash.startsWith('revoked:')) return null
  const initial = initialShare(row.id, row.client_key)
  // Preserve links returned when recordings were first created. For later
  // generations, a keyed capability can be recovered without storing plaintext
  // tokens. Its MAC binds both the recording and the random persisted generation.
  return digest(initial) === row.share_hash ? initial : `v1.${row.id}.${initialShare(row.id, `share:${row.share_hash}`)}`
}
export async function ownerShare(actor: string, id: string) {
  const row = await owned(actor, id)
  return { id, shareId: currentShare(row), revoked: row.share_hash.startsWith('revoked:') }
}
export async function changeShare(actor: string, id: string, revoke: boolean) {
  const row = await owned(actor, id)
  if (row.share_hash.startsWith('revoked:') === revoke) return ownerShare(actor, id)
  const generation = randomBytes(32).toString('hex')
  // Compare-and-swap fences concurrent enable/unshare and metadata changes.
  // Concurrent enables return the winning generation rather than rotate it.
  checked(await database().from('recordings').update({ share_hash: revoke ? `revoked:${generation}` : generation,
    revision: row.revision + 1, updated_at: new Date().toISOString() })
    .eq('id', id).eq('owner_id', actor).eq('revision', row.revision).eq('share_hash', row.share_hash).is('deleted_at', null).select('id'))
  const result = await ownerShare(actor, id)
  if (result.revoked !== revoke) throw new RecordError('record_conflict', 409, true)
  return result
}
export async function playback(row: RecordingRow) {
  const db = database()
  const jobs = checked(await db.from('recording_jobs').select('stage,state,failure').eq('recording_id', row.id))
  const mediaReady = jobs?.some(j => j.stage === 'metadata' && j.state === 'done')
  const media = mediaReady ? await artifacts(row.id) : []
  const signedArtifacts = await Promise.all(media.map(async artifact => {
    checkPath(row.id, artifact.path)
    const signed = checked(await db.storage.from(RECORD_BUCKET).createSignedUrl(artifact.path, 300))
    if (!signed) throw new RecordError('record_unavailable', 503, true)
    return { id: artifact.id, kind: artifact.kind, mime: artifact.mime, offsetMs: artifact.offset_ms,
      url: signed.signedUrl, expiresInSeconds: 300 }
  }))
  const transcript = await allPages((from, to) => db.from('recording_transcript_segments').select('id,start_ms,end_ms,text,language')
    .eq('recording_id', row.id).order('start_ms').order('id').range(from, to))
  const keyframes = checked(await db.from('recording_keyframes').select('id,event_id,at_ms,artifact_id,crop_artifact_id,segment_ids')
    .eq('recording_id', row.id).order('at_ms').order('id'))
  const events = checked(await db.from('recording_events').select('data').eq('recording_id', row.id).order('sequence'))
  const { projectKey: _privateProject, ...recording } = summary(row)
  return { recording, stages: jobs, artifacts: signedArtifacts, transcript, keyframes, events: events?.map(e => e.data) }
}
export async function ownerPlayback(actor: string, id: string) { return playback(await owned(actor, id)) }
export async function readShare(token: unknown) {
  const value = parse(shareToken, token)
  const lookup = database().from('recordings').select('*')
  const row = checked(await (value.startsWith('v1.') ? lookup.eq('id', value.split('.')[1]) : lookup.eq('share_hash', digest(value))).is('deleted_at', null).maybeSingle())
  if (!row) throw new RecordError('record_not_found', 404)
  if (value.startsWith('v1.')) {
    const expected = currentShare(row as RecordingRow)
    if (!expected || expected.length !== value.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(value))) throw new RecordError('record_not_found', 404)
  }
  const result = await playback(row as RecordingRow)
  // Recheck after signing to fence revocation/deletion during response assembly.
  const current = checked(await database().from('recordings').select('id').eq('id', row.id).eq('share_hash', row.share_hash).is('deleted_at', null).maybeSingle())
  if (!current) throw new RecordError('record_not_found', 404)
  return result
}
