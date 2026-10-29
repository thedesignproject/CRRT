// Local Docker only. Real HTTP, Postgres quota RPC and hosted adapter, with a
// loopback provider fake. No hosted transcription or provider credential used.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import postgres from 'postgres'
import handler from '../api/v1/extension/recordings/transcribe.js'
import { hostedSpeech } from '../api/_lib/record/processing.js'
for (const key of ['DATABASE_URL', 'SUPABASE_URL']) {
  if (!['localhost', '127.0.0.1', 'supabase_db_crrt', 'supabase_kong_crrt'].includes(new URL(process.env[key]!).hostname)) throw new Error('Requires Docker')
}
const db = postgres(process.env.DATABASE_URL!, { max: 4 })
let calls = 0, providerFails = false, lastProviderBytes = 0
const provider = createServer(async (req, res) => { let bytes = 0; for await (const chunk of req) bytes += chunk.length; lastProviderBytes = bytes; calls++; res.writeHead(providerFails ? 500 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ results: { utterances: [{ start: 0, end: 1, transcript: 'Local provider fixture' }] } })) })
await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
Object.assign(process.env, { VERCEL: '', RECORD_DEMO_TRANSCRIPTION_ENABLED: 'true', EXTENSION_ALLOWED_IDS: 'abcdefghijklmnopabcdefghijklmnop',
  DEEPGRAM_API_KEY: 'local-provider-fixture', DEEPGRAM_API_BASE_URL: `http://127.0.0.1:${(provider.address() as any).port}`,
  RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR: '2', RECORD_TRANSCRIPTION_GLOBAL_REQUESTS_PER_DAY: '10' })
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const response: any = { setHeader: (key: string, value: string) => res.setHeader(key, value), status: (code: number) => { res.statusCode = code; return response },
    json: (value: unknown) => res.end(JSON.stringify(value)), end: () => res.end() }
  await handler({ method: req.method, headers: req.headers, socket: req.socket, body: Buffer.concat(chunks), query: {} } as any, response)
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${(server.address() as any).port}`
const post = () => fetch(origin, { method: 'POST', headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'Content-Type': 'application/octet-stream', 'x-forwarded-for': crypto.randomUUID() }, body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1]) })
try {
  await db`delete from public.recording_transcription_limits`
  const results = await Promise.all(Array.from({ length: 12 }, post))
  assert.equal(results.filter(r => r.status === 200).length, 2)
  assert.equal(results.filter(r => r.status === 429).length, 10)
  for (const response of results.filter(r => r.status === 429)) assert.equal(typeof (await response.json() as any).error, 'string')
  assert.equal(calls, 2, 'Spoofed forwarding headers must not bypass socket client quota')
  assert.equal((await db`select requests from public.recording_transcription_limits where identity='global'`)[0].requests, 2)
  await db`delete from public.recording_transcription_limits`
  process.env.RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR = '1'; providerFails = true
  assert.equal((await post()).status, 502)
  assert.equal((await post()).status, 429)
  assert.equal(calls, 3, 'Provider failures must not refund the persistent reservation')
  await db`delete from public.recording_transcription_limits`
  process.env.RECORD_TRANSCRIPTION_GLOBAL_BYTES_PER_DAY = '4'
  assert.equal((await post()).status, 429)
  assert.equal(calls, 3)
  delete process.env.RECORD_TRANSCRIPTION_GLOBAL_BYTES_PER_DAY
  await db`delete from public.recording_transcription_limits`
  providerFails = false
  Object.assign(process.env, { RECORD_TRANSCRIPTION_ENABLED: 'true', RECORD_TRANSCRIPTION_POLICY_VERSION: 'record-v1', RECORD_TRANSCRIPTION_CLIENT_REQUESTS_PER_HOUR: '2', RECORD_TRANSCRIPTION_GLOBAL_REQUESTS_PER_DAY: '3' })
  const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])
  const before = calls
  // Independent owner allowances must still serialize with the HTTP endpoint's
  // global budget. Repeated attempts by the same owner must not reset it.
  const attempts = await Promise.allSettled([
    ...Array.from({ length: 4 }, () => hostedSpeech.transcribe(audio, 'en', 'owner-one')),
    ...Array.from({ length: 4 }, () => hostedSpeech.transcribe(audio, 'en', 'owner-two')),
  ])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 3)
  assert.equal(calls - before, 3)
  assert.equal((await post()).status, 429, 'Worker and HTTP admissions must share the global ceiling')
  assert.equal((await db`select requests from public.recording_transcription_limits where identity='global'`)[0].requests, 3)
  await db`delete from public.recording_transcription_limits`
  const largeAudio = new Uint8Array(5 * 1024 * 1024)
  const beforeLarge = calls
  await hostedSpeech.transcribe(largeAudio, 'en', 'long-recording-owner')
  assert.equal(calls, beforeLarge + 1, 'Valid worker audio above the demo endpoint size must reach the provider adapter')
  assert.equal(lastProviderBytes, largeAudio.length)
  assert.equal((await db`select bytes from public.recording_transcription_limits where identity='global'`)[0].bytes, String(largeAudio.length))
  const admittedCalls = calls
  await db`revoke execute on function public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint) from service_role`
  try {
    assert.equal((await post()).status, 503)
    await assert.rejects(hostedSpeech.transcribe(audio, 'en', 'owner-one'), (error: any) => error.status === 503)
    assert.equal(calls, admittedCalls, 'Unavailable quota RPC must prevent HTTP and worker provider dispatch')
  } finally { await db`grant execute on function public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint) to service_role` }
  console.log('PASS: concurrent HTTP/worker limits, shared budgets, 5 MiB worker payload, spoof resistance, failure charges and fail-closed quota storage; only loopback provider called')
} finally {
  await db`delete from public.recording_transcription_limits`
  server.closeAllConnections(); server.close(); provider.closeAllConnections(); provider.close(); await db.end()
}
