import { z } from 'zod'
import { checked, database, owned, parse, RecordError, type RecordingRow } from './core.js'
import { uuid } from './contracts.js'
import { r2Storage, PART_BYTES, UPLOAD_SECONDS } from './r2.js'
import { checkPath, type ArtifactRow } from './storage.js'

type MultipartArtifact = ArtifactRow & { multipart_id?: string | null }
async function artifact(id: string, artifactId: string) {
  const row = checked(await database().from('recording_artifacts').select('*').eq('recording_id', id).eq('id', artifactId).maybeSingle()) as MultipartArtifact | null
  if (!row) throw new RecordError('record_not_found', 404)
  checkPath(id, row.path)
  return row
}
export async function authorizeMultipart(actor: string, recording: RecordingRow, artifactId: string) {
  const row = await artifact(recording.id, artifactId), storage = r2Storage(recording.storage_bucket!)
  if (row.verified_at) throw new RecordError('record_conflict', 409)
  let uploadId = row.multipart_id
  let parts: Awaited<ReturnType<typeof storage.parts>> | undefined
  if (uploadId) {
    try { parts = await storage.parts(row.path, uploadId) }
    catch (error) { if ((error as { name: string }).name !== 'NoSuchUpload') throw error }
  }
  if (!parts) {
    // A completed session also returns NoSuchUpload. Never replace an object
    // whose completion succeeded before its database verification was saved.
    if (!(await storage.inspect(row.path)).error) throw new RecordError('record_conflict', 409)
    const created = await storage.create(row.path, row.mime)
    let update = database().from('recording_artifacts').update({ multipart_id: created }).eq('id', row.id).is('verified_at', null)
    update = uploadId ? update.eq('multipart_id', uploadId) : update.is('multipart_id', null)
    let saved
    try { saved = checked(await update.select('id')) }
    catch (error) { await storage.abort(row.path, created); throw error }
    if (!saved?.length) {
      await storage.abort(row.path, created)
      throw new RecordError('record_conflict', 409, true)
    }
    uploadId = created
    parts = []
  }
  await owned(actor, recording.id)
  return { version: 'record.v1', protocol: 's3-multipart' as const, recordingId: recording.id, artifactId,
    uploadId, partSize: PART_BYTES, expiresInSeconds: UPLOAD_SECONDS,
    // ETags are transport resume markers, never whole-object SHA-256 digests.
    uploadedParts: parts.map(part => ({ number: part.PartNumber!, bytes: part.Size!, etag: part.ETag! })) }
}
const partSchema = z.object({ artifactId: uuid, uploadId: z.string().min(1).max(2048), partNumber: z.number().int().min(1).max(128) }).strict()
export async function authorizePart(actor: string, id: string, body: unknown) {
  const recording = await owned(actor, id), input = parse(partSchema, body)
  if (recording.storage_provider !== 'r2' || recording.manifest_hash) throw new RecordError('record_conflict', 409)
  const row = await artifact(id, input.artifactId)
  if (row.multipart_id !== input.uploadId || row.verified_at) throw new RecordError('record_conflict', 409)
  const offset = (input.partNumber - 1) * PART_BYTES
  if (offset >= row.bytes) throw new RecordError('record_invalid', 400)
  const bytes = Math.min(PART_BYTES, row.bytes - offset)
  const url = await r2Storage(recording.storage_bucket!).part(row.path, input.uploadId, input.partNumber, bytes)
  await owned(actor, id)
  return { url, bytes, expiresInSeconds: UPLOAD_SECONDS }
}
export async function completeMultipart(recording: RecordingRow, artifact: ArtifactRow) {
  const row = artifact as MultipartArtifact
  const storage = r2Storage(recording.storage_bucket!)
  // A previous complete can have succeeded despite a lost response.
  const existing = await storage.inspect(row.path)
  if (!existing.error) return existing
  if (!row.multipart_id) throw new RecordError('record_upload_incomplete', 409, true)
  const parts = await storage.parts(row.path, row.multipart_id)
  const count = Math.ceil(row.bytes / PART_BYTES)
  if (parts.length !== count || parts.some((part, index) => part.PartNumber !== index + 1 || !part.ETag || part.Size !== Math.min(PART_BYTES, row.bytes - index * PART_BYTES))) throw new RecordError('record_upload_incomplete', 409, true)
  await storage.complete(row.path, row.multipart_id, parts.map(part => ({ PartNumber: part.PartNumber!, ETag: part.ETag! })))
  return storage.inspect(row.path)
}
