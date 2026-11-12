import { afterEach, expect, it, vi } from 'vitest'
import { uploadMultipart, type MultipartAuthorization } from './recording-multipart'
const size = 8 * 1024 * 1024
const authorization: MultipartAuthorization = { protocol: 's3-multipart', partSize: size, uploadId: 'upload', recordingId: 'record', artifactId: 'artifact', uploadedParts: [] }
afterEach(() => vi.unstubAllGlobals())
it('uploads direct bounded parts and resumes only storage-confirmed parts', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal('fetch', request)
  const blob = new Blob([new Uint8Array(size + 3)])
  const sign = vi.fn().mockResolvedValue({ url: 'https://bucket.r2.cloudflarestorage.com/part', bytes: 3 })
  await uploadMultipart(blob, { ...authorization, uploadedParts: [{ number: 1, bytes: size, etag: 'etag' }] }, sign)
  expect(sign).toHaveBeenCalledExactlyOnceWith({ artifactId: 'artifact', uploadId: 'upload', partNumber: 2 })
  expect(request.mock.calls[0][1].body.size).toBe(3)
  expect(request.mock.calls[0][1]).toMatchObject({ method: 'PUT', credentials: 'omit', redirect: 'error' })
})
it('does not skip mismatching or unconfirmed parts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
  const sign = vi.fn().mockResolvedValue({ url: 'http://127.0.0.1:43900/part', bytes: 3 })
  await uploadMultipart(new Blob(['abc']), { ...authorization, uploadedParts: [{ number: 1, bytes: 2, etag: 'old' }] }, sign)
  await uploadMultipart(new Blob(['abc']), { ...authorization, uploadedParts: [{ number: 1, bytes: 3, etag: '' }] }, sign)
  expect(sign).toHaveBeenCalledTimes(2)
})
it.each([{ partSize: 1 }, {}])('rejects invalid size or oversized objects: %j', async override => {
  const blob = override.partSize ? new Blob(['a']) : { size: 1_073_741_825 } as Blob
  await expect(uploadMultipart(blob, { ...authorization, ...override }, vi.fn())).rejects.toThrow('authorization')
})
it('requires the signed byte count and reports failures without losing local media', async () => {
  const blob = new Blob(['abc']), sign = vi.fn().mockResolvedValue({ url: 'https://r2.test/part', bytes: 1 })
  await expect(uploadMultipart(blob, authorization, sign)).rejects.toThrow('size')
  sign.mockResolvedValue({ url: 'https://r2.test/part', bytes: 3 })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
  await expect(uploadMultipart(blob, authorization, sign)).rejects.toThrow('local copy is safe')
  expect(blob.size).toBe(3)
})
it.each(['http://other.test/part', 'ftp://r2.test/part', 'https://user:pass@r2.test/part'])('rejects insecure or credential-bearing URL %s', async url => {
  await expect(uploadMultipart(new Blob(['a']), authorization, vi.fn().mockResolvedValue({ url, bytes: 1 }))).rejects.toThrow('destination')
})
it('accepts loopback S3 transport only for local testing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
  await uploadMultipart(new Blob(['a']), authorization, vi.fn().mockResolvedValue({ url: 'http://localhost:43900/part', bytes: 1 }))
})
