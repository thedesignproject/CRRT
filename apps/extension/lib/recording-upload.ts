/** Storage-specific transport. Recorder state only persists an opaque session URL. */
export type UploadAuthorization = {
  protocol: 'tus'; endpoint: string; headers: Record<string, string>
  metadata: Record<string, string>; chunkSize: number
}
export type UploadCheckpoint = { location?: string; complete?: boolean }

function sessionUrl(value: string, endpoint: string) {
  const url = new URL(value, endpoint), allowed = new URL(endpoint)
  if (url.origin !== allowed.origin || !url.pathname.startsWith(`${allowed.pathname}/`) || url.username || url.password) throw new Error('Invalid upload session scope.')
  return url.href
}

export async function uploadRecordingArtifact(blob: Blob, authorization: UploadAuthorization, checkpoint: UploadCheckpoint, persist: () => Promise<void>) {
  if (authorization.protocol !== 'tus' || !Number.isSafeInteger(authorization.chunkSize) || authorization.chunkSize <= 0) throw new Error('Unsupported recording upload protocol.')
  const headers = { apikey: import.meta.env.WXT_SUPABASE_ANON_KEY, ...authorization.headers, 'Tus-Resumable': '1.0.0' }
  const request = (url: string, init: RequestInit) => fetch(url, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
  let location = checkpoint.location ? sessionUrl(checkpoint.location, authorization.endpoint) : undefined
  if (location) {
    const head = await request(location, { method: 'HEAD', headers })
    if (head.status === 404 || head.status === 410) { location = undefined; delete checkpoint.location; await persist() }
    else if (!head.ok) throw new Error('Could not resume recording upload. Retry upload.')
  }
  if (!location) {
    const metadata = Object.entries(authorization.metadata).map(([key, value]) => `${key} ${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}`).join(',')
    const response = await request(authorization.endpoint, { method: 'POST', headers: { ...headers, 'Upload-Length': String(blob.size), 'Upload-Metadata': metadata } })
    const returned = response.headers.get('Location')
    if (response.status !== 201 || !returned) throw new Error('Could not start recording upload. Retry upload.')
    location = sessionUrl(returned, authorization.endpoint)
    checkpoint.location = location
    await persist()
  }
  // HEAD is authoritative after every interruption, including a lost PATCH response.
  const head = await request(location, { method: 'HEAD', headers })
  const rawOffset = head.headers.get('Upload-Offset')
  let offset = Number(rawOffset)
  if (!head.ok || rawOffset === null || !Number.isSafeInteger(offset) || offset < 0 || offset > blob.size) throw new Error('Invalid recording upload offset.')
  while (offset < blob.size) {
    const end = Math.min(offset + authorization.chunkSize, blob.size)
    const response = await request(location, { method: 'PATCH', headers: { ...headers, 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' }, body: blob.slice(offset, end) })
    if (response.status !== 204) throw new Error('Recording upload interrupted. Your local copy is safe. Retry upload.')
    offset = end
  }
}
