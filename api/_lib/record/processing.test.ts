import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), recording: null as any, leases: null as any, transcript: vi.fn(), owned: vi.fn(), command: vi.fn(), cleanup: vi.fn() }))
vi.mock('../recording-transcription-limit.js', async original => ({ ...await original<typeof import('../recording-transcription-limit')>(), reserveRecordingTranscription: vi.fn() }))
vi.mock('./core.js', async original => ({ ...await original<typeof import('./core')>(), database: () => ({ from: m.from }), rpc: m.rpc, owned: m.owned, command: m.command }))
vi.mock('./storage.js', () => ({ artifacts: async () => [], cleanupObjects: m.cleanup }))
vi.mock('../recording-transcription.js', async original => ({ ...await original<typeof import('../recording-transcription')>(), transcribeRecordingAudio: m.transcript }))
import { hostedSpeech, renew, retryProcessing, runNext } from './processing'
import { RecordError } from './core'
import { RecordingTranscriptionError } from '../recording-transcription'
import { reserveRecordingTranscription, TranscriptionLimitError } from '../recording-transcription-limit'
const job = { recording_id: 'recording', stage: 'metadata' as const, attempts: 1, lease_token: 'lease' }
const media = { derive: vi.fn(), audio: vi.fn() }
const speech = { transcribe: vi.fn() }
beforeEach(() => {
  vi.mocked(reserveRecordingTranscription).mockReset().mockResolvedValue(undefined)
  m.recording = { id: 'recording', owner_id: 'owner', deleted_at: null, duration_ms: 1000, consent: { hostedTranscription: true, language: 'en' }, manifest: { artifacts: [] } }
  m.leases = [{ recording_id: 'recording' }]
  m.from.mockImplementation(table => {
    const q: any = { then: (resolve: any) => Promise.resolve({ data: table === 'recordings' ? m.recording : m.leases, error: null }).then(resolve) }
    for (const name of ['select', 'eq', 'maybeSingle', 'single', 'update', 'gt']) q[name] = () => q
    return q
  })
  m.rpc.mockImplementation(async name => name === 'record_claim' ? job : true)
  media.derive.mockResolvedValue({ artifacts: [], keyframes: [] }); media.audio.mockResolvedValue(new Uint8Array([1]))
  speech.transcribe.mockResolvedValue({ source: 'fake', language: 'en', segments: [{ id: 'one', startMs: 0, endMs: 500, text: 'Review' }] })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers() })
it('claims durable stages, records outputs and idles when no work exists', async () => {
  media.derive.mockImplementationOnce(async (_recording, _artifacts, _signal, checkWrite) => { await checkWrite(); return { artifacts: [], keyframes: [] } })
  for (const stage of ['metadata', 'transcription', 'alignment', 'cleanup'] as const) {
    expect(await runNext(stage, { media, speech })).toBe(true)
  }
  expect(await runNext('alignment')).toBe(true)
  expect(m.cleanup).toHaveBeenCalledWith('recording')
  m.rpc.mockResolvedValue(null)
  expect(await runNext('metadata')).toBe(false)
})
it('never invokes hosted transcription without consent and handles silent audio', async () => {
  m.recording.consent.hostedTranscription = false
  await runNext('transcription', { media, speech })
  expect(media.audio).not.toHaveBeenCalled()
  m.recording.consent.hostedTranscription = true
  media.audio.mockResolvedValue(null)
  await runNext('transcription', { media, speech })
  expect(speech.transcribe).not.toHaveBeenCalled()
  media.audio.mockResolvedValue(new Uint8Array([1]))
  m.recording.manifest.artifacts = [{ kind: 'audio', offsetMs: 20 }]
  await runNext('transcription', { media, speech })
  expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_output.segments[0].startMs).toBe(20)
})
it('validates provider clocks and stores safe retryable or terminal failures without deleting source', async () => {
  for (const segment of [{ startMs: -1, endMs: 1 }, { startMs: 0.5, endMs: 1 }, { startMs: 1, endMs: 0.5 }, { startMs: 20, endMs: 10 }, { startMs: 0, endMs: 9000 }, { startMs: 0, endMs: 1, text: 'x'.repeat(10001) }]) {
    speech.transcribe.mockResolvedValue({ segments: [{ text: 'words', ...segment }] })
    await runNext('transcription', { media, speech })
    expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_failure.code).toBe('record_transcript_invalid')
  }
  for (const [error, code] of [[new RecordError('invalid_media', 422), 'invalid_media'], [new RecordingTranscriptionError(502, 'private provider body'), 'record_transcription_failed'], [new Error('private secret'), 'record_processing_failed']] as const) {
    media.derive.mockRejectedValue(error)
    await runNext('metadata', { media })
    expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_failure.code).toBe(code)
  }
  m.rpc.mockImplementation(async name => name === 'record_claim' ? { ...job, attempts: 4 } : true)
  await runNext('metadata', { media })
  expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_failure.code).toBe('record_worker_interrupted')
})
it('renews only live leases and aborts work after deletion or lease loss', async () => {
  await renew(job)
  m.leases = null
  await expect(renew(job)).rejects.toThrow('record_job_cancelled')
  m.leases = []
  await expect(renew(job)).rejects.toThrow('record_job_cancelled')
  m.recording = null
  await expect(renew(job)).rejects.toThrow('record_job_cancelled')
  m.recording = { deleted_at: 'now' }
  await expect(renew(job)).rejects.toThrow('record_job_cancelled')
  m.leases = [{}]
  await renew({ ...job, stage: 'cleanup' })
  m.recording = { deleted_at: null }
  vi.useFakeTimers()
  media.derive.mockImplementation(async () => {
    m.recording.deleted_at = 'now'
    await vi.advanceTimersByTimeAsync(30_001)
    return { artifacts: [], keyframes: [] }
  })
  await runNext('metadata', { media })
  expect(m.rpc.mock.calls[m.rpc.mock.calls.length - 1][1].p_failure.code).toBe('record_job_cancelled')
})
it('gates hosted STT by explicit policy activation and retries authorized stages', async () => {
  await expect(hostedSpeech.transcribe(new Uint8Array(), 'en', 'owner')).rejects.toThrow('record_transcription_disabled')
  vi.stubEnv('RECORD_TRANSCRIPTION_ENABLED', 'true')
  await expect(hostedSpeech.transcribe(new Uint8Array(), 'en', 'owner')).rejects.toThrow('record_transcription_disabled')
  vi.stubEnv('RECORD_TRANSCRIPTION_POLICY_VERSION', 'record-v1')
  m.transcript.mockResolvedValue({ source: 'deepgram:nova-3', language: 'es', segments: [] })
  await hostedSpeech.transcribe(new Uint8Array(), 'es', 'owner')
  expect(m.transcript).toHaveBeenCalledWith(new Uint8Array(), { language: 'es', signal: undefined })
  expect(reserveRecordingTranscription).toHaveBeenCalledWith('owner', 0)
  expect(vi.mocked(reserveRecordingTranscription).mock.invocationCallOrder[0]).toBeLessThan(m.transcript.mock.invocationCallOrder[0])
  await runNext('transcription', { media })
  m.owned.mockResolvedValue({}); m.command.mockResolvedValue({ state: 'processing' })
  expect(await retryProcessing('owner', 'id', { stage: 'transcription' })).toEqual({ id: 'id', state: 'processing' })
})
it.each([429, 503] as const)('does not call the provider when durable quota admission fails with %s', async status => {
  vi.stubEnv('RECORD_TRANSCRIPTION_ENABLED', 'true')
  vi.stubEnv('RECORD_TRANSCRIPTION_POLICY_VERSION', 'record-v1')
  vi.mocked(reserveRecordingTranscription).mockRejectedValue(new TranscriptionLimitError(status, 'Private detail'))
  await runNext('transcription', { media })
  expect(reserveRecordingTranscription).toHaveBeenCalledWith('owner', 1)
  expect(m.transcript).not.toHaveBeenCalled()
  expect(m.rpc.mock.lastCall![1].p_failure).toEqual({ code: status === 429 ? 'record_transcription_limited' : 'record_transcription_quota_unavailable', stage: 'transcription', retryable: true })
  await runNext('transcription', { media })
  expect(reserveRecordingTranscription).toHaveBeenCalledTimes(2)
  expect(m.transcript).not.toHaveBeenCalled()
})
it('never reserves or dispatches an already cancelled transcription', async () => {
  vi.stubEnv('RECORD_TRANSCRIPTION_ENABLED', 'true'); vi.stubEnv('RECORD_TRANSCRIPTION_POLICY_VERSION', 'record-v1')
  const controller = new AbortController(); controller.abort()
  await expect(hostedSpeech.transcribe(new Uint8Array([1]), 'en', 'owner', controller.signal)).rejects.toThrow('record_job_cancelled')
  expect(reserveRecordingTranscription).not.toHaveBeenCalled()
  expect(m.transcript).not.toHaveBeenCalled()
})
it('does not send audio after deletion is detected while quota admission is pending', async () => {
  vi.stubEnv('RECORD_TRANSCRIPTION_ENABLED', 'true'); vi.stubEnv('RECORD_TRANSCRIPTION_POLICY_VERSION', 'record-v1'); vi.useFakeTimers()
  let admit!: () => void
  vi.mocked(reserveRecordingTranscription).mockImplementation(() => new Promise(resolve => { admit = resolve }))
  const pending = runNext('transcription', { media })
  await vi.advanceTimersByTimeAsync(1)
  expect(reserveRecordingTranscription).toHaveBeenCalledOnce()
  m.recording.deleted_at = 'now'
  await vi.advanceTimersByTimeAsync(30_001)
  admit(); await pending
  expect(m.transcript).not.toHaveBeenCalled()
  expect(m.rpc.mock.lastCall![1].p_failure.code).toBe('record_job_cancelled')
})
it('rechecks ownership after media preparation before invoking speech', async () => {
  media.audio.mockImplementation(async () => { m.recording.deleted_at = 'now'; return new Uint8Array([1]) })
  await runNext('transcription', { media, speech })
  expect(speech.transcribe).not.toHaveBeenCalled()
  expect(m.rpc.mock.lastCall![1].p_failure.code).toBe('record_job_cancelled')
})
it.each([new Error('connection reset'), new RecordError('record_unavailable', 503, true)])('keeps a transient heartbeat failure retryable: %s', async error => {
  vi.useFakeTimers()
  media.derive.mockImplementation(async () => {
    m.from.mockImplementationOnce(() => { throw error })
    await vi.advanceTimersByTimeAsync(30_001)
    return { artifacts: [], keyframes: [] }
  })
  await runNext('metadata', { media })
  expect(m.rpc.mock.lastCall![1].p_failure).toEqual({ code: 'record_unavailable', stage: 'metadata', retryable: true })
  expect(m.cleanup).not.toHaveBeenCalled()
  m.owned.mockResolvedValue({}); m.command.mockResolvedValue({ state: 'processing' })
  expect(await retryProcessing('owner', 'id', { stage: 'metadata' })).toEqual({ id: 'id', state: 'processing' })
})
