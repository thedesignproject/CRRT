// Real HTTP/auth/TUS/storage/FFmpeg/database test, with an injected speech
// provider. Runs inside record-worker.Dockerfile; never contacts hosted STT.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { getServiceSupabase, getSupabase } from '../api/_lib/supabase.js'
import { digest, rpc } from '../api/_lib/record/core.js'
import { runNext } from '../api/_lib/record/processing.js'
import { artifacts as recordingArtifacts, RECORD_BUCKET } from '../api/_lib/record/storage.js'
import { recordObjectStorage } from '../api/_lib/record/object-storage.js'
import { r2Storage } from '../api/_lib/record/r2.js'
import { compactRecordingManifest, recordingManifestBytes } from '../apps/extension/lib/recording-manifest.js'
import { normalizeRecordingTitle } from '../apps/extension/lib/recording.js'
import collection from '../api/v1/recordings/index.js'
import item from '../api/v1/recordings/[id]/index.js'
import project from '../api/v1/recordings/[id]/project.js'
import upload from '../api/v1/recordings/[id]/uploads.js'
import uploadParts from '../api/v1/recordings/[id]/upload-parts.js'
import complete from '../api/v1/recordings/[id]/complete.js'
import finalize from '../api/v1/recordings/[id]/finalize.js'
import retry from '../api/v1/recordings/[id]/retry.js'
import share from '../api/v1/recordings/[id]/share.js'
import playback from '../api/v1/recordings/[id]/playback.js'
import publicShare from '../api/v1/recording-shares/[token].js'
import agent from '../api/v1/recordings/[id]/agent-payload.js'
import capabilities from '../api/v1/recordings/capabilities.js'

for (const key of ['SUPABASE_URL', 'DATABASE_URL']) {
  const hostname = new URL(process.env[key] || '').hostname
  if (!['127.0.0.1', 'localhost', 'supabase_kong_crrt', 'supabase_db_crrt'].includes(hostname)) throw new Error('Integration tests require the local Docker stack')
}
process.env.CRRT_RECORD_ENABLED = 'true'
process.env.CRRT_DEPLOYMENT_MODE = 'cloud'
process.env.STRIPE_PRO_PRICE_ID = 'price_record_local_pro'
process.env.STRIPE_STUDIO_PRICE_ID = 'price_record_local_studio'
process.env.RECORD_TRANSCRIPTION_ENABLED = 'false'
const db = postgres(process.env.DATABASE_URL!, { max: 4 })
const service = getServiceSupabase()
const directory = await mkdtemp(join(tmpdir(), 'record-fixture-'))
const createdUsers: string[] = [], createdRecordings: string[] = []
const orphanRecordings: string[] = []
const projectKey = `record-test-${randomUUID()}`
const routes: Record<string, any> = { '': collection, capabilities, project, uploads: upload, 'upload-parts': uploadParts, complete, finalize, retry, share, playback, 'agent-payload': agent }
async function storage(recording: string) {
  return recordObjectStorage((await db`select storage_provider, storage_bucket from public.recordings where id=${recording}`)[0] as any)
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url!, 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    const query: Record<string, string> = Object.fromEntries(url.searchParams)
    let handler: any
    if (parts[2] === 'recording-shares') { query.token = parts[3]; handler = publicShare }
    else if (parts[3] === 'capabilities') handler = capabilities
    else if (parts[3]) { query.id = parts[3]; handler = parts[4] ? routes[parts[4]] : item }
    else handler = collection
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
    const adapter: any = { setHeader: (key: string, value: string) => response.setHeader(key, value),
      status: (status: number) => { response.statusCode = status; return adapter },
      json: (value: unknown) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)) }, end: () => response.end() }
    await handler({ method: request.method, headers: request.headers, query, body }, adapter)
    if (!response.writableEnded) response.end()
  } catch { response.statusCode = 500; response.end('{"error":"test server failed"}') }
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address() as { port: number }
const origin = `http://127.0.0.1:${address.port}/api/v1`
async function api(path: string, token: string | null, method = 'GET', body?: unknown, expected = 200) {
  const response = await fetch(`${origin}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const value = await response.json() as any
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`)
  return value
}
async function user() {
  const email = `${randomUUID()}@record.test`, password = randomUUID()
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error('Could not provision local test user')
  createdUsers.push(data.user.id)
  const login = await getSupabase().auth.signInWithPassword({ email, password })
  assert.ok(login.data.session)
  return { id: data.user.id, token: login.data.session.access_token }
}
async function tus(recording: string, token: string, bytes: Buffer, kind = 'screen', declaredHash = digest(bytes)) {
  const declaration = { id: randomUUID(), kind, mime: kind === 'audio' ? 'audio/webm' : 'video/webm', bytes: bytes.length, sha256: declaredHash, offsetMs: 0 }
  const authorization = await api(`recordings/${recording}/uploads`, token, 'POST', declaration)
  if (authorization.protocol === 's3-multipart') {
    for (let offset = 0, partNumber = 1; offset < bytes.length; offset += authorization.partSize, partNumber++) {
      const signed = await api(`recordings/${recording}/upload-parts`, token, 'POST', { artifactId: declaration.id, uploadId: authorization.uploadId, partNumber })
      const chunk = bytes.subarray(offset, offset + authorization.partSize)
      assert.notEqual((await fetch(signed.url, { method: 'PUT', body: chunk.subarray(1) })).status, 200, 'Part signatures must enforce declared byte length')
      const tampered = new URL(signed.url); tampered.pathname = '/record-test/other.webm'
      assert.notEqual((await fetch(tampered, { method: 'PUT', body: chunk })).status, 200)
      const response = await fetch(signed.url, { method: 'PUT', body: chunk })
      assert.equal(response.status, 200, await response.text())
      const resumed = await api(`recordings/${recording}/uploads`, token, 'POST', declaration)
      assert.equal(resumed.uploadId, authorization.uploadId)
      assert.equal(resumed.uploadedParts[partNumber - 1].bytes, chunk.length)
    }
    await api(`recordings/${recording}/complete`, token, 'POST', { artifactId: declaration.id })
    await api(`recordings/${recording}/complete`, token, 'POST', { artifactId: declaration.id })
    return declaration
  }
  const headers = { 'Tus-Resumable': '1.0.0', apikey: process.env.SUPABASE_KEY!, ...authorization.headers }
  const metadata = Object.entries(authorization.metadata).map(([key, value]) => `${key} ${Buffer.from(String(value)).toString('base64')}`).join(',')
  const tampered = Object.entries({ ...authorization.metadata, objectName: `other/${randomUUID()}.webm` }).map(([key, value]) => `${key} ${Buffer.from(String(value)).toString('base64')}`).join(',')
  const denied = await fetch(authorization.endpoint, { method: 'POST', headers: { ...headers, 'Upload-Length': String(bytes.length), 'Upload-Metadata': tampered } })
  assert.ok([400, 403].includes(denied.status), 'Signed authorization must reject another object path')
  const created = await fetch(authorization.endpoint, { method: 'POST', headers: { ...headers, 'Upload-Length': String(bytes.length), 'Upload-Metadata': metadata } })
  assert.equal(created.status, 201, await created.text())
  const resumed = new URL(created.headers.get('location')!, authorization.endpoint)
  // Local Storage advertises its host-side port in Location. Containers reach
  // that same service through Kong's internal port on the Docker network.
  resumed.host = new URL(authorization.endpoint).host
  const location = resumed.href
  let offset = 0
  while (offset < bytes.length) {
    // Reconnect through HEAD each time rather than relying on client memory.
    const head = await fetch(location, { method: 'HEAD', headers })
    assert.equal(head.status, 200)
    assert.equal(Number(head.headers.get('upload-offset')), offset)
    const chunk = bytes.subarray(offset, offset + authorization.chunkSize)
    const patched = await fetch(location, { method: 'PATCH', headers: { ...headers, 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' }, body: chunk })
    assert.equal(patched.status, 204, await patched.text())
    offset += chunk.length
  }
  await api(`recordings/${recording}/complete`, token, 'POST', { artifactId: declaration.id })
  await api(`recordings/${recording}/complete`, token, 'POST', { artifactId: declaration.id })
  return declaration
}
async function drainFixtureCleanup(recording: string) {
  // Older development tombstones can already be due after the local worker was
  // stopped. A global claim need not belong to this fixture; drain bounded work
  // until its cleanup actually commits, including artifact-free multipart rows.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!await runNext('cleanup')) break
    const after = (await db`select state from public.recording_jobs where recording_id=${recording} and stage='cleanup'`)[0].state
    if (after === 'done') return
  }
  throw new Error('Fixture cleanup did not complete within the bounded queue drain')
}
function ffmpeg(args: string[]) {
  const result = Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...args], { stdout: 'pipe', stderr: 'pipe' })
  assert.equal(result.exitCode, 0, result.stderr.toString())
}
try {
  const owner = await user(), stranger = await user()
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:v', 'libvpx', '-deadline', 'realtime', '-c:a', 'libopus', '-live', '1', join(directory, 'screen.webm')])
  const liveProbe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', join(directory, 'screen.webm')])
  assert.equal(liveProbe.exitCode, 0)
  assert.equal(JSON.parse(liveProbe.stdout.toString()).format.duration, undefined, 'Fixture must retain the missing-duration behavior of live recorder chunks')
  ffmpeg(['-f', 'lavfi', '-i', 'color=blue:size=160x120:rate=10', '-t', '2', '-c:v', 'libvpx', '-deadline', 'realtime', '-an', join(directory, 'camera.webm')])
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:a', 'libopus', join(directory, 'audio.webm')])
  const input = { clientKey: randomUUID(), title: 'Checkout review', source: 'tab', consent: { hostedTranscription: true, provider: 'deepgram', language: 'en', policyVersion: 'record-v1' } }
  await api('recordings', null, 'POST', input, 401)
  const created = await api('recordings', owner.token, 'POST', input, 201)
  const id = created.recording.id
  createdRecordings.push(id)
  assert.equal((await api('recordings', owner.token, 'POST', input, 201)).recording.id, id)
  assert.equal((await api('recordings', owner.token)).recordings[0].id, id)
  assert.deepEqual((await api('recordings', stranger.token)).recordings, [])
  await api(`recordings/${id}`, owner.token, 'PATCH', { title: 'Checkout review, revised' })
  assert.equal((await api(`recording-shares/${created.shareId}`, null)).recording.state, 'recording')
  await api(`recordings/${id}`, stranger.token, 'GET', undefined, 404)
  await api(`recordings/${id}/project`, owner.token, 'POST', { projectKey: 'inaccessible' }, 403)
  const screen = await tus(id, owner.token, await readFile(join(directory, 'screen.webm')))
  const camera = await tus(id, owner.token, await readFile(join(directory, 'camera.webm')), 'camera')
  const audio = await tus(id, owner.token, await readFile(join(directory, 'audio.webm')), 'audio')
  const eventId = randomUUID()
  const manifest = { version: 'record.v1', durationMs: 2000, artifacts: [screen, camera, audio], events: [{ id: eventId, sequence: 0, kind: 'mark', atMs: 500,
    mark: { type: 'pin', points: [{ x: 0.5, y: 0.5 }], text: 'Fix this', pinNumber: 1 }, target: { selector: '#pay', pageUrl: 'https://example.test/#//[?secret=value' },
    capture: { width: 320, height: 240 }, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }] }
  await api(`recordings/${id}/finalize`, owner.token, 'POST', manifest)
  await api(`recordings/${id}/finalize`, owner.token, 'POST', manifest)
  await api(`recordings/${id}/finalize`, owner.token, 'POST', { ...manifest, durationMs: 2001 }, 409)
  assert.equal((await api(`recording-shares/${created.shareId}`, null)).recording.state, 'processing')
  await runNext('metadata')
  const [metadataJob] = await db`select state,failure from public.recording_jobs where recording_id=${id} and stage='metadata'`
  assert.equal(metadataJob.state, 'done', JSON.stringify(metadataJob.failure))
  // A transient provider failure preserves media, retries twice durably, and
  // then exposes an explicit authorized retry operation.
  for (let attempt = 0; attempt < 3; attempt++) {
    await db`update public.recording_jobs set available_at=now() where recording_id=${id} and stage='transcription'`
    await runNext('transcription', { speech: { transcribe: async () => { throw new Error('simulated provider outage') } } })
  }
  assert.equal((await api(`recording-shares/${created.shareId}`, null)).recording.state, 'failed')
  const failedPlayback = await api(`recording-shares/${created.shareId}`, null)
  assert.ok(failedPlayback.artifacts.some((a: any) => a.kind === 'screen'))
  await api(`recordings/${id}/retry`, stranger.token, 'POST', { stage: 'transcription' }, 404)
  await api(`recordings/${id}/retry`, owner.token, 'POST', { stage: 'transcription' })
  await runNext('transcription', { speech: { transcribe: async () => ({ source: 'fixture', language: 'en', segments: [{ id: 'one', startMs: 0, endMs: 1500, text: 'The checkout button needs a clearer label.' }] }) } })
  await runNext('alignment')
  const ready = await api(`recording-shares/${created.shareId}`, null)
  assert.equal(ready.recording.state, 'ready')
  // A checksum-valid audio track can still exceed the declared screen timeline.
  // Decode/index it locally and fail before any billable speech adapter call.
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '8', '-c:a', 'libopus', '-live', '1', join(directory, 'long-audio.webm')])
  const oversizedAudio = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID() }, 201)
  const badId = oversizedAudio.recording.id; createdRecordings.push(badId)
  const badScreen = await tus(badId, owner.token, await readFile(join(directory, 'screen.webm')))
  const badAudio = await tus(badId, owner.token, await readFile(join(directory, 'long-audio.webm')), 'audio')
  await api(`recordings/${badId}/finalize`, owner.token, 'POST', { version: 'record.v1', durationMs: 2000, artifacts: [badScreen, badAudio], events: [] })
  await runNext('metadata')
  let speechCalls = 0
  await runNext('transcription', { speech: { transcribe: async () => { speechCalls++; throw new Error('Must not dispatch oversized audio') } } })
  assert.equal(speechCalls, 0)
  const [badJob] = await db`select state,failure from public.recording_jobs where recording_id=${badId} and stage='transcription'`
  assert.equal(badJob.state, 'failed')
  assert.equal(badJob.failure.code, 'record_audio_duration_mismatch')
  assert.equal((await recordingArtifacts(badId)).length, 3, 'Rejected transcription preserves the source tracks and thumbnail')
  assert.deepEqual(ready.keyframes[0].segment_ids, ['one'])
  assert.equal(ready.events[0].target.selector, '#pay')
  assert.equal(ready.events[0].target.pageUrl, 'https://example.test/#//[')
  assert.equal(ready.recording.markCount, 1)
  assert.equal(ready.recording.authorId, owner.id)
  assert.equal(ready.artifacts.filter((a: any) => ['thumbnail', 'keyframe', 'crop'].includes(a.kind)).length, 3)
  const privatePlayback = ready.artifacts.find((a: any) => a.kind === 'screen')
  assert.equal((await fetch(privatePlayback.url)).status, 200)
  assert.equal((await fetch(privatePlayback.url, { headers: { Range: 'bytes=0-9' } })).status, 206)
  const unsigned = new URL(privatePlayback.url); unsigned.search = ''
  assert.notEqual((await fetch(unsigned)).status, 200, 'Unsigned private media must be inaccessible')
  const path = (await db`select path from public.recording_artifacts where id=${screen.id}`)[0].path
  assert.notEqual((await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${RECORD_BUCKET}/${path}`)).status, 200)
  await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: randomUUID() }, 402)
  await db`insert into public.billing_accounts(user_id,plan,price_id,subscription_status,period_start,period_end)
    values(${owner.id},'pro','price_record_local_pro','active',now()-interval '1 day',now()+interval '29 days')`
  const key = randomUUID()
  const payload = await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: key })
  assert.equal((await fetch(payload.artifactAccess[0].url)).status, 200)
  assert.equal(payload.sha256, (await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: key })).sha256)
  assert.equal((await api('recordings/capabilities', owner.token)).usage.agentPayloadsToday, 1)
  const narration = Array.from({ length: 1001 }, (_, index) => ({ recording_id: id, id: `page-segment-${String(index).padStart(4, '0')}`,
    start_ms: index, end_ms: index + 1, text: 'Additional spoken context', provider: 'fixture', language: 'en' }))
  await db`insert into public.recording_transcript_segments ${db(narration, 'recording_id', 'id', 'start_ms', 'end_ms', 'text', 'provider', 'language')}`
  assert.equal((await api(`recording-shares/${created.shareId}`, null)).transcript.length, 1002)
  assert.equal((await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: randomUUID() })).payload.transcript.length, 1002)
  await db`delete from public.recording_transcript_segments where recording_id=${id} and id like 'page-segment-%'`
  const imageBytes = Buffer.from(await (await fetch(payload.artifactAccess[0].url)).arrayBuffer())
  await db`update public.billing_accounts set subscription_status='canceled' where user_id=${owner.id}`
  await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: key }, 402)
  await db`update public.billing_accounts set subscription_status='active' where user_id=${owner.id}`
  assert.equal((await db`select count(*)::int n from public.cloud_usage where owner_id=${owner.id}`)[0].n, 0)
  await db`insert into public.projects(public_key,slug,name) values(${projectKey},${projectKey},'Record fixture')`
  await db`insert into public.project_members(project_key,user_id,role,is_owner) values(${projectKey},${owner.id},'admin',true)`
  await db`insert into public.project_repo_configs(project_key,agent_instructions) values(${projectKey},'Read AGENTS.md before editing')`
  await api(`recordings/${id}/project`, owner.token, 'POST', { projectKey })
  assert.equal((await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: randomUUID() })).payload.project.instructions, 'Read AGENTS.md before editing')
  await db`update public.project_repo_configs set agent_instructions='Use current instructions' where project_key=${projectKey}`
  assert.equal((await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: randomUUID() })).payload.project.instructions, 'Use current instructions')
  await db`delete from public.project_members where project_key=${projectKey} and user_id=${owner.id}`
  await api(`recordings/${id}/agent-payload`, owner.token, 'POST', { requestKey: randomUUID() }, 403)
  await db`insert into public.project_members(project_key,user_id,role,is_owner) values(${projectKey},${owner.id},'admin',true)`
  await api(`recordings/${id}/share`, stranger.token, 'GET', undefined, 404)
  await api(`recordings/${id}/share`, stranger.token, 'DELETE', undefined, 404)
  assert.equal((await api(`recordings/${id}/share`, owner.token)).shareId, created.shareId)
  assert.equal((await api(`recordings/${id}/share`, owner.token, 'POST')).shareId, created.shareId)
  await api(`recording-shares/${created.shareId}`, null)
  await api(`recordings/${id}/share`, owner.token, 'DELETE')
  await api(`recordings/${id}/share`, owner.token, 'DELETE')
  assert.equal((await api(`recordings/${id}/share`, owner.token)).shareId, null)
  await api(`recording-shares/${created.shareId}`, null, 'GET', undefined, 404)
  const enabled = await Promise.all(Array.from({ length: 4 }, () => api(`recordings/${id}/share`, owner.token, 'POST')))
  assert.ok(enabled[0].shareId.startsWith('v1.'))
  assert.ok(enabled.every(result => result.shareId === enabled[0].shareId), 'Concurrent enables must return the same winning generation')
  assert.equal((await api(`recordings/${id}/share`, owner.token)).shareId, enabled[0].shareId)
  await api(`recording-shares/${enabled[0].shareId}`, null)
  await api(`recording-shares/${created.shareId}`, null, 'GET', undefined, 404)
  await api(`recording-shares/${enabled[0].shareId.replace(id, stranger.id)}`, null, 'GET', undefined, 404)
  await api(`recordings/${id}/share`, owner.token, 'DELETE')
  await api(`recording-shares/${enabled[0].shareId}`, null, 'GET', undefined, 404)
  // Exercise a real 413 -> compact -> idempotent finalize recovery after media
  // is already uploaded, with a long valid note retained independently of title.
  const fullNote = 'n'.repeat(2000)
  const dense = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID(), title: normalizeRecordingTitle(fullNote) }, 201)
  createdRecordings.push(dense.recording.id)
  assert.equal(dense.recording.title.length, 240)
  const denseScreen = await tus(dense.recording.id, owner.token, await readFile(join(directory, 'screen.webm')))
  const denseManifest: any = { version: 'record.v1', durationMs: 2000, artifacts: [denseScreen], events: Array.from({ length: 50 }, (_, sequence) => ({
    id: randomUUID(), sequence, atMs: sequence, kind: 'mark', mark: { type: 'draw', points: Array.from({ length: 2048 }, (_, i) => ({ x: i / 2049, y: (i % 19) / 19 })) },
  })) }
  denseManifest.events[0].mark = { type: 'text', text: fullNote, points: [{ x: .5, y: .5 }] }
  assert.ok(recordingManifestBytes(denseManifest) > 1_048_576)
  await api(`recordings/${dense.recording.id}/finalize`, owner.token, 'POST', denseManifest, 413)
  const compact = compactRecordingManifest(denseManifest)
  assert.ok(recordingManifestBytes(compact) < 900_000)
  assert.equal(compact.events[0].mark!.text, fullNote)
  assert.equal(compact.artifacts[0].id, denseScreen.id)
  await api(`recordings/${dense.recording.id}/finalize`, owner.token, 'POST', compact)
  await api(`recordings/${dense.recording.id}/finalize`, owner.token, 'POST', compact)
  await api(`recordings/${dense.recording.id}`, owner.token, 'DELETE')
  // A multi-chunk upload proves reconnect/offset recovery. A corrupt declared
  // hash is then rejected by processing and never receives playback URLs.
  const corrupt = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID() }, 201)
  createdRecordings.push(corrupt.recording.id)
  const bad = await tus(corrupt.recording.id, owner.token, Buffer.alloc(8 * 1024 * 1024 + 128, 1), 'screen', 'a'.repeat(64))
  await api(`recordings/${corrupt.recording.id}/finalize`, owner.token, 'POST', { ...manifest, artifacts: [bad], events: [] })
  await runNext('metadata')
  const blocked = await api(`recording-shares/${corrupt.shareId}`, null)
  assert.equal(blocked.recording.failure.code, 'record_artifact_mismatch')
  assert.deepEqual(blocked.artifacts, [])
  const paged = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID() }, 201)
  createdRecordings.push(paged.recording.id)
  const imageRows = Array.from({ length: 1004 }, () => { const artifact = randomUUID(); return { id: artifact, recording_id: paged.recording.id,
    kind: 'keyframe', path: `${owner.id}/${paged.recording.id}/${artifact}.jpg`, mime: 'image/jpeg', bytes: 1, sha256: 'b'.repeat(64) } })
  await db`insert into public.recording_artifacts ${db(imageRows, 'id', 'recording_id', 'kind', 'path', 'mime', 'bytes', 'sha256')}`
  assert.equal((await recordingArtifacts(paged.recording.id)).length, 1004)
  let abandoned: { uploadId: string; path: string } | undefined
  if (process.env.RECORD_STORAGE_PROVIDER === 'r2') {
    const unfinished = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID() }, 201)
    const recording = unfinished.recording.id
    createdRecordings.push(recording)
    const declaration = { id: randomUUID(), kind: 'screen', mime: 'video/webm', bytes: 3, sha256: digest('abc'), offsetMs: 0 }
    const authorization = await api(`recordings/${recording}/uploads`, owner.token, 'POST', declaration)
    const signed = await api(`recordings/${recording}/upload-parts`, owner.token, 'POST', { artifactId: declaration.id, uploadId: authorization.uploadId, partNumber: 1 })
    assert.equal((await fetch(signed.url, { method: 'PUT', body: 'abc' })).status, 200)
    abandoned = { uploadId: authorization.uploadId, path: `${owner.id}/${recording}/${declaration.id}.webm` }
  }
  const orphan = await api('recordings', stranger.token, 'POST', { ...input, clientKey: randomUUID() }, 201)
  orphanRecordings.push(orphan.recording.id)
  const removed = await service.auth.admin.deleteUser(stranger.id)
  assert.equal(removed.error, null)
  await api(`recording-shares/${orphan.shareId}`, null, 'GET', undefined, 404)
  // Exercise indexed seeking near the end of a full-length live capture, not
  // just a short finalized fixture. One frame/second keeps this test compact.
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=1', '-t', '3600', '-c:v', 'libvpx', '-deadline', 'realtime', '-an', '-live', '1', join(directory, 'hour.webm')])
  const long = await api('recordings', owner.token, 'POST', { ...input, clientKey: randomUUID(), title: 'One-hour capture',
    consent: { ...input.consent, hostedTranscription: false } }, 201)
  createdRecordings.push(long.recording.id)
  const longScreen = await tus(long.recording.id, owner.token, await readFile(join(directory, 'hour.webm')))
  const lateEvents = [1_800_000, 3_598_000, 3_600_000].map((atMs, sequence) => ({ id: randomUUID(), kind: 'click', sequence, atMs,
    crop: [
      { x: 0.999, y: 0, width: 0.001, height: 1 },
      { x: 0, y: 0.999, width: 1, height: 0.001 },
      { x: 0.999, y: 0.999, width: 0.001, height: 0.001 },
    ][sequence] }))
  await api(`recordings/${long.recording.id}/finalize`, owner.token, 'POST', { version: 'record.v1', durationMs: 3_600_000, artifacts: [longScreen], events: lateEvents })
  await runNext('metadata')
  const [longJob] = await db`select state,failure from public.recording_jobs where recording_id=${long.recording.id} and stage='metadata'`
  assert.equal(longJob.state, 'done', JSON.stringify(longJob.failure))
  assert.deepEqual((await api(`recording-shares/${long.shareId}`, null)).keyframes.map((frame: any) => frame.at_ms), lateEvents.map(e => e.atMs))
  const endPlayback = await api(`recording-shares/${long.shareId}`, null)
  for (const artifact of endPlayback.artifacts.filter((a: any) => ['keyframe', 'crop'].includes(a.kind))) {
    const response = await fetch(artifact.url)
    assert.equal(response.status, 200)
    const image = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual(Array.from(image.slice(0, 2)), [0xff, 0xd8], 'EOF frames and subpixel crops must produce real JPEGs')
    const probe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', 'pipe:0'], { stdin: image, stdout: 'pipe', stderr: 'pipe' })
    assert.equal(probe.exitCode, 0, probe.stderr.toString())
    const dimensions = JSON.parse(probe.stdout.toString()).streams[0]
    assert.ok(dimensions.width >= 1 && dimensions.width <= 640 && dimensions.height >= 1 && dimensions.height <= 640,
      'Full frames and extreme-aspect-ratio crops must fit inside 640 by 640 pixels')
  }
  for (const recording of createdRecordings) {
    await api(`recordings/${recording}`, owner.token, 'DELETE')
    await api(`recordings/${recording}`, owner.token, 'DELETE')
    await db`update public.recording_jobs set available_at=now() where recording_id=${recording} and stage='cleanup'`
    await drainFixtureCleanup(recording)
    assert.equal((await db`select count(*)::int n from public.recording_artifacts where recording_id=${recording}`)[0].n, 0)
    const objects = await (await storage(recording)).list(`${owner.id}/${recording}`, 100)
    assert.equal(objects.data?.length, 0)
  }
  if (abandoned) await assert.rejects(r2Storage(process.env.RECORD_R2_BUCKET!).parts(abandoned.path, abandoned.uploadId), { name: 'NoSuchUpload' })
  // Simulate a provider-side write that completed after its original worker
  // lost its lease. Reconciliation must work without any artifact metadata.
  const latePath = `${owner.id}/${id}/${randomUUID()}.jpg`
  const lateAuthorization = await (await storage(id)).signUpload(latePath)
  const late = lateAuthorization.data as { signedUrl: string; headers?: Record<string, string> }
  assert.equal((await fetch(late.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', ...late.headers }, body: imageBytes })).status, 200)
  await db`update public.recording_jobs set available_at=now() where recording_id=${id} and stage='cleanup'`
  await rpc('record_sweep', {}); await drainFixtureCleanup(id)
  assert.equal((await (await storage(id)).list(`${owner.id}/${id}`, 100)).data?.length, 0)
  console.log(`PASS: HTTP/Auth/${process.env.RECORD_STORAGE_PROVIDER === 'r2' ? 'S3 multipart/resume' : 'TUS'}, private playback, live WebM without duration, one-hour capture with late indexed frames, STT retry/alignment, 1002 transcript segments, 1004 artifacts, paid current-context payload, immediate account-share revocation, and late-write reconciliation`)
} finally {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  for (const recording of [...createdRecordings, ...orphanRecordings]) {
    const rows = await db`select path from public.recording_artifacts where recording_id=${recording}`
    for (let offset = 0; offset < rows.length; offset += 100) await (await storage(recording)).remove(rows.slice(offset, offset + 100).map(r => r.path))
    await db`delete from public.recordings where id=${recording}`
  }
  await db`delete from public.projects where public_key=${projectKey}`
  for (const id of createdUsers) {
    await db`delete from public.billing_accounts where user_id=${id}`
    await service.auth.admin.deleteUser(id)
  }
  await db.end(); await rm(directory, { recursive: true, force: true })
}
