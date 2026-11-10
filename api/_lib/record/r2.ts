import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { RecordError } from './core.js'

export const PART_BYTES = 8 * 1024 * 1024
export const UPLOAD_SECONDS = 900
export function r2Client() {
  const endpoint = process.env.RECORD_R2_ENDPOINT
  const accessKeyId = process.env.RECORD_R2_ACCESS_KEY_ID, secretAccessKey = process.env.RECORD_R2_SECRET_ACCESS_KEY
  const account = process.env.RECORD_R2_ACCOUNT_ID
  if (!accessKeyId || !secretAccessKey || (!endpoint && !/^[a-f0-9]{32}$/.test(account || ''))) throw new RecordError('record_configuration', 503)
  const url = new URL(endpoint || `https://${account}.r2.cloudflarestorage.com`)
  // An alternate S3 endpoint is for local integration only, never an arbitrary remote service.
  if (endpoint && (!['127.0.0.1', 'localhost', 'record-r2-local'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) throw new RecordError('record_configuration', 503)
  return new S3Client({ region: 'auto', endpoint: url.href, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2 })
}
export function r2Storage(Bucket: string) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(Bucket)) throw new RecordError('record_configuration', 503)
  const client = r2Client()
  const result = <T>(data: T) => ({ data, error: null })
  return {
    async signUpload(Key: string) {
      // Workers are the only callers for derived writes. Immutable UUID paths
      // and a conditional put preserve independent processing retry boundaries.
      return result({ signedUrl: await getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType: 'image/jpeg', IfNoneMatch: '*' }), { expiresIn: UPLOAD_SECONDS }), token: '', path: Key, headers: { 'If-None-Match': '*' } })
    },
    async signPlayback(Key: string, seconds: number) { return result({ signedUrl: await getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: seconds }) }) },
    async inspect(Key: string) {
      try { const object = await client.send(new HeadObjectCommand({ Bucket, Key })); return result({ size: object.ContentLength, contentType: object.ContentType }) }
      catch (error) { if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404) return { data: null, error: { message: 'not found' } }; throw error }
    },
    async list(prefix: string, limit: number) {
      const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: `${prefix}/`, MaxKeys: limit }))
      return result((page.Contents || []).map(object => ({ name: object.Key!.slice(prefix.length + 1) })))
    },
    async remove(paths: string[]) { await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: paths.map(Key => ({ Key })), Quiet: true } })).then(response => { if (response.Errors?.length) throw new RecordError('record_cleanup_pending', 503, true) }); return result([]) },
    async download(Key: string) { const object = await client.send(new GetObjectCommand({ Bucket, Key })); return result(new Blob([await object.Body!.transformToByteArray() as Uint8Array<ArrayBuffer>])) },
    async create(Key: string, mime: string) { const created = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: mime })); if (!created.UploadId) throw new RecordError('record_unavailable', 503, true); return created.UploadId },
    async abort(Key: string, UploadId: string) {
      try { await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })) }
      catch (error) { if ((error as { name: string }).name !== 'NoSuchUpload') throw error }
    },
    async part(Key: string, UploadId: string, PartNumber: number, bytes: number) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber, ContentLength: bytes }), { expiresIn: UPLOAD_SECONDS, signableHeaders: new Set(['content-length']) })
    },
    async parts(Key: string, UploadId: string) {
      // Record's 1 GiB cap and 8 MiB parts allow at most 128 parts.
      const response = await client.send(new ListPartsCommand({ Bucket, Key, UploadId, MaxParts: 1000 }))
      if (response.IsTruncated) throw new RecordError('record_artifact_mismatch', 409)
      return response.Parts || []
    },
    async complete(Key: string, UploadId: string, parts: { PartNumber: number; ETag: string }[]) {
      // Only the server completes the single durable session. R2 documents
      // conditional PUTs, but not conditional multipart completion.
      await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: parts } }))
    },
  }
}
