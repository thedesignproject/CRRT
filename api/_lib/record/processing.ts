import { randomUUID } from 'node:crypto'
import { transcribeRecordingAudio, RecordingTranscriptionError } from '../recording-transcription.js'
import { reserveRecordingTranscription, TranscriptionLimitError } from '../recording-transcription-limit.js'
import { retrySchema } from './contracts.js'
import { checked, command, database, limit, owned, parse, RecordError, rpc, type RecordingRow } from './core.js'
import { artifacts, cleanupObjects } from './storage.js'
import { ffmpegProcessor, type MediaProcessor, type Transcript } from './media.js'

export type Stage = 'metadata' | 'transcription' | 'alignment' | 'cleanup'
type Job = { recording_id: string; stage: Stage; attempts: number; lease_token: string }
export type SpeechAdapter = { transcribe(audio: Uint8Array, language: string, owner: string, signal?: AbortSignal): Promise<Transcript> }
export const hostedSpeech: SpeechAdapter = {
  async transcribe(audio, language, owner, signal) {
    if (process.env.RECORD_TRANSCRIPTION_ENABLED !== 'true' || process.env.RECORD_TRANSCRIPTION_POLICY_VERSION !== 'record-v1') throw new RecordError('record_transcription_disabled', 503, true)
    if (signal?.aborted) throw new RecordError('record_job_cancelled', 409)
    await reserveRecordingTranscription(owner, audio.length)
    if (signal?.aborted) throw new RecordError('record_job_cancelled', 409)
    return transcribeRecordingAudio(audio, { language, signal })
  },
}
export async function retryProcessing(actor: string, id: string, body: unknown) {
  await owned(actor, id)
  const input = parse(retrySchema, body)
  const row = await command(actor, id, 'retry', input)
  return { id, state: row.state }
}
export async function renew(job: Job) {
  const recording = checked(await database().from('recordings').select('deleted_at').eq('id', job.recording_id).maybeSingle())
  if (!recording || (recording.deleted_at && job.stage !== 'cleanup')) throw new RecordError('record_job_cancelled', 409)
  const rows = checked(await database().from('recording_jobs').update({ lease_until: new Date(Date.now() + 300_000).toISOString() })
    .eq('recording_id', job.recording_id).eq('stage', job.stage).eq('lease_token', job.lease_token)
    .eq('state', 'running').gt('lease_until', new Date().toISOString()).select('recording_id'))
  if (!rows?.length) throw new RecordError('record_job_cancelled', 409)
}
export async function runNext(stage: Stage, options: { media?: MediaProcessor; speech?: SpeechAdapter } = {}) {
  const job = await rpc<Job | null>('record_claim', { p_stage: stage, p_lease: randomUUID() })
  if (!job) return false
  const controller = new AbortController()
  let interruption = new RecordError('record_job_cancelled', 409)
  const heartbeat = setInterval(() => { void renew(job).catch(error => {
    interruption = error instanceof RecordError ? error : new RecordError('record_unavailable', 503, true)
    controller.abort()
  }) }, 30_000)
  try {
    if (job.attempts > 3 && stage !== 'cleanup') throw new RecordError('record_worker_interrupted', 503, true)
    await renew(job)
    const recording = checked(await database().from('recordings').select('*').eq('id', job.recording_id).single()) as RecordingRow
    let output: unknown = {}
    const media = options.media || ffmpegProcessor
    if (stage === 'metadata') output = { ...await media.derive(recording, await artifacts(recording.id), controller.signal, () => renew(job)), byteLimit: limit('RECORD_MAX_STORAGE_BYTES', 5_368_709_120) }
    if (stage === 'transcription') {
      if (!recording.consent.hostedTranscription) output = { source: 'none', language: recording.consent.language, segments: [] }
      else {
        const audio = await media.audio(recording, await artifacts(recording.id), controller.signal)
        await renew(job)
        const transcript = audio ? await (options.speech || hostedSpeech).transcribe(audio, recording.consent.language, recording.owner_id, controller.signal) : { source: 'none', language: recording.consent.language, segments: [] }
        const offset = recording.manifest!.artifacts.find(a => a.kind === 'audio')?.offsetMs || 0
        const segments = transcript.segments.map(s => ({ ...s, startMs: s.startMs + offset, endMs: s.endMs + offset }))
        if (segments.some(s => !Number.isInteger(s.startMs) || !Number.isInteger(s.endMs) || s.startMs < 0 || s.endMs < s.startMs || s.endMs > recording.duration_ms! + 2000 || s.text.length > 10000)) throw new RecordError('record_transcript_invalid', 422)
        output = { ...transcript, segments }
      }
    }
    if (stage === 'cleanup') await cleanupObjects(recording.id)
    if (controller.signal.aborted) throw interruption
    await rpc('record_finish', { p_id: job.recording_id, p_stage: stage, p_lease: job.lease_token, p_output: output, p_failure: null })
  } catch (error) {
    const failure = controller.signal.aborted ? interruption : error instanceof RecordError ? error : error instanceof TranscriptionLimitError
      ? new RecordError(error.status === 429 ? 'record_transcription_limited' : 'record_transcription_quota_unavailable', error.status, true) : error instanceof RecordingTranscriptionError
      ? new RecordError('record_transcription_failed', error.status, true) : new RecordError('record_processing_failed', 503, true)
    await rpc('record_finish', { p_id: job.recording_id, p_stage: stage, p_lease: job.lease_token, p_output: {},
      p_failure: { code: failure.code, stage, retryable: failure.retryable } })
  } finally { clearInterval(heartbeat) }
  return true
}
