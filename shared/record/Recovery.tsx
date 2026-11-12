import { useState } from 'react'
import type { RecordingPlayback } from './client'
import './Recovery.css'

export type RecoveryStage = 'metadata' | 'transcription' | 'alignment'
const messages = {
  metadata: { failed: 'We couldn’t prepare your video.', retry: 'Retry video', automatic: 'We’re retrying video preparation automatically.' },
  transcription: { failed: 'We couldn’t transcribe this recording.', retry: 'Retry transcription', automatic: 'We’re retrying transcription automatically.' },
  alignment: { failed: 'We couldn’t prepare your key moments.', retry: 'Retry key moments', automatic: 'We’re retrying key moments automatically.' },
}

export function recordingAfterRetry(playback: RecordingPlayback | undefined, stage: RecoveryStage) {
  if (!playback) return playback
  const stages = playback.stages.map(job => job.stage === stage ? { ...job, state: 'pending', failure: null } : job)
  const failure = stages.find(job => job.state === 'failed')?.failure ?? null
  return { ...playback, stages, recording: { ...playback.recording, state: failure ? 'failed' as const : 'processing' as const, failure } }
}

export function RecordingRecovery({ stages, retry }: { stages: RecordingPlayback['stages']; retry?: (stage: RecoveryStage) => Promise<void> }) {
  const [busy, setBusy] = useState<RecoveryStage | null>(null)
  const [error, setError] = useState('')
  async function request(stage: RecoveryStage) {
    setBusy(stage); setError('')
    try { await retry!(stage) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(null) }
  }
  return <>
    {stages.map(job => {
      if (!(job.stage in messages)) return null
      const stage = job.stage as RecoveryStage, message = messages[stage]
      if (job.state === 'failed') return <div key={stage} className="recording-recovery">
        <p>{message.failed}</p>
        {retry && job.failure?.retryable && <button type="button" disabled={busy !== null} onClick={() => { void request(stage) }}>{busy === stage ? 'Retrying…' : message.retry}</button>}
      </div>
      if (job.failure && (job.state === 'pending' || job.state === 'running')) return <p key={stage} role="status" className="recording-recovery">{message.automatic}</p>
      return null
    })}
    {error && <p role="alert" className="recording-recovery">{error}</p>}
  </>
}
