export type MultipartAuthorization = {
  protocol: 's3-multipart'; uploadId: string; recordingId: string; artifactId: string; partSize: number
  uploadedParts: { number: number; bytes: number; etag: string }[]
}
export async function uploadMultipart(blob: Blob, authorization: MultipartAuthorization,
  sign: (body: { artifactId: string; uploadId: string; partNumber: number }) => Promise<{ url: string; bytes: number }>,
) {
  const size = authorization.partSize
  if (size !== 8 * 1024 * 1024 || blob.size > 1_073_741_824) throw new Error('Invalid multipart upload authorization.')
  const uploaded = new Map(authorization.uploadedParts.map(part => [part.number, part]))
  for (let offset = 0, number = 1; offset < blob.size; offset += size, number++) {
    const bytes = Math.min(size, blob.size - offset)
    const previous = uploaded.get(number)
    if (previous?.bytes === bytes && previous.etag) continue
    const signed = await sign({ artifactId: authorization.artifactId, uploadId: authorization.uploadId, partNumber: number })
    if (signed.bytes !== bytes) throw new Error('Invalid multipart upload size.')
    const url = new URL(signed.url)
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname)
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('Invalid multipart upload destination.')
    const response = await fetch(url, { method: 'PUT', body: blob.slice(offset, offset + bytes), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
    if (!response.ok) throw new Error('Recording upload interrupted. Your local copy is safe. Retry upload.')
  }
}
