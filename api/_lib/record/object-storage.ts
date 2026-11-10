import { database, RecordError, type RecordingRow } from './core.js'
import { r2Storage } from './r2.js'

export const RECORD_BUCKET = 'record-media'
/** Record's storage port. Supabase and R2 implement this boundary; lifecycle and
 * recorder state consume scoped authorizations and never choose object paths. */
export function newRecordingStorage() {
  const provider = process.env.RECORD_STORAGE_PROVIDER || 'supabase'
  if (!['supabase', 'r2'].includes(provider)) throw new RecordError('record_configuration', 503)
  const bucket = provider === 'r2' ? process.env.RECORD_R2_BUCKET : RECORD_BUCKET
  if (!bucket) throw new RecordError('record_configuration', 503)
  if (provider === 'r2') r2Storage(bucket)
  return { storageProvider: provider, storageBucket: bucket }
}
export function recordObjectStorage(recording?: Pick<RecordingRow, 'storage_provider' | 'storage_bucket'>) {
  if (recording?.storage_provider && !['supabase', 'r2'].includes(recording.storage_provider)) throw new RecordError('record_configuration', 503)
  if (recording?.storage_provider === 'r2') return r2Storage(recording.storage_bucket!)
  const bucket = database().storage.from(recording?.storage_bucket || RECORD_BUCKET)
  return {
    signUpload: (path: string) => bucket.createSignedUploadUrl(path, { upsert: false }),
    signPlayback: (path: string, seconds: number) => bucket.createSignedUrl(path, seconds),
    inspect: (path: string) => bucket.info(path),
    list: (prefix: string, limit: number) => bucket.list(prefix, { limit }),
    remove: (paths: string[]) => bucket.remove(paths),
    download: (path: string) => bucket.download(path),
  }
}
export function resumableAuthorization(path: string, mime: string, signature: string) {
  return { protocol: 'tus',
    endpoint: new URL('/storage/v1/upload/resumable/sign', process.env.SUPABASE_URL).href,
    headers: { 'x-signature': signature },
    metadata: { bucketName: RECORD_BUCKET, objectName: path, contentType: mime },
    chunkSize: 6 * 1024 * 1024, expiresInSeconds: 7200, upsert: false }
}
