import { afterEach, expect, it, vi } from 'vitest'
import { uploadRecordingArtifact, type UploadAuthorization } from './recording-upload'
const authorization: UploadAuthorization = { protocol: 'tus', endpoint: 'https://storage.test/upload', headers: { 'x-signature': 'scoped' }, metadata: { name: 'test' }, chunkSize: 3 }
const head = (offset: string | null = '0', status = 200) => new Response(null, { status, headers: offset === null ? {} : { 'Upload-Offset': offset } })
const created = (location = '/upload/session', status = 201) => new Response(null, { status, headers: { Location: location } })
afterEach(() => vi.unstubAllGlobals())
it('persists a scoped session before sending bounded media chunks directly to storage', async () => {
  const request = vi.fn().mockResolvedValueOnce(created()).mockResolvedValueOnce(head()).mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', request)
  const checkpoint = {}, persist = vi.fn().mockResolvedValue(undefined)
  await uploadRecordingArtifact(new Blob(['abcdefg']), authorization, checkpoint, persist)
  expect(checkpoint).toEqual({ location: 'https://storage.test/upload/session' })
  expect(persist).toHaveBeenCalledOnce()
  expect(request.mock.calls.filter(([, init]) => init.method === 'PATCH').map(([, init]) => init.body.size)).toEqual([3, 3, 1])
  expect(request.mock.calls[2][1].headers['Upload-Offset']).toBe('0')
  expect(request.mock.calls[4][1].headers['Upload-Offset']).toBe('6')
})
it('resumes from storage offset after a lost response without resending accepted bytes', async () => {
  const request = vi.fn().mockResolvedValueOnce(head('3')).mockResolvedValueOnce(head('3')).mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', request)
  await uploadRecordingArtifact(new Blob(['abcdef']), authorization, { location: 'https://storage.test/upload/session' }, vi.fn())
  expect(request).toHaveBeenCalledTimes(3)
  expect(request.mock.calls[2][1].headers['Upload-Offset']).toBe('3')
})
it.each([404, 410])('recreates an expired session (%s)', async status => {
  const request = vi.fn().mockResolvedValueOnce(head('0', status)).mockResolvedValueOnce(created()).mockResolvedValueOnce(head('1'))
  vi.stubGlobal('fetch', request)
  const persist = vi.fn()
  await uploadRecordingArtifact(new Blob(['a']), authorization, { location: 'https://storage.test/upload/old' }, persist)
  expect(persist).toHaveBeenCalledTimes(2)
})
it('fails closed for a foreign session URL', async () => {
  vi.stubGlobal('fetch', vi.fn())
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, { location: 'https://evil.test/upload/session' }, vi.fn())).rejects.toThrow('scope')
  expect(fetch).not.toHaveBeenCalled()
})
it.each(['https://storage.test/other/session', 'https://user:pass@storage.test/upload/session'])('rejects out-of-scope paths or credentials: %s', async location => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(created(location)))
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, {}, vi.fn())).rejects.toThrow('scope')
})
it.each([{ protocol: 'other' }, { chunkSize: 0 }, { chunkSize: 1.5 }])('rejects unsupported authorization %j', async override => {
  await expect(uploadRecordingArtifact(new Blob(['a']), { ...authorization, ...override } as UploadAuthorization, {}, vi.fn())).rejects.toThrow('protocol')
})
it('reports a resume failure without creating another object', async () => {
  const request = vi.fn().mockResolvedValue(head('0', 403)); vi.stubGlobal('fetch', request)
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, { location: 'https://storage.test/upload/session' }, vi.fn())).rejects.toThrow('resume')
  expect(request).toHaveBeenCalledOnce()
})
it.each([new Response(null, { status: 503 }), new Response(null, { status: 201 })])('rejects failed or missing upload creation', async response => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, {}, vi.fn())).rejects.toThrow('start')
})
it.each([head(null), head('-1'), head('2'), head('0.5'), head('x'), head('0', 503)])('rejects invalid authoritative offsets', async response => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(created()).mockResolvedValueOnce(response))
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, {}, vi.fn())).rejects.toThrow('offset')
})
it('retains its checkpoint after a patch fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(created()).mockResolvedValueOnce(head()).mockResolvedValueOnce(new Response(null, { status: 503 })))
  const checkpoint = {}
  await expect(uploadRecordingArtifact(new Blob(['a']), authorization, checkpoint, vi.fn())).rejects.toThrow('interrupted')
  expect(checkpoint).toHaveProperty('location')
})
