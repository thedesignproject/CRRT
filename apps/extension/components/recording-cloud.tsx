import { useEffect, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import { recordingShareUrl, type RecordingPlayback } from '../../../shared/record/client'
import { isMissingCloudRecording, ownerRecordRequest, readRecordingPlayback, syncRecording } from '../lib/recording-cloud'
import { captureRecordingTitle, MAX_RECORDING_NOTE_LENGTH, type LocalRecording, type RecordingMark } from '../lib/recording'
import { RecordingNoteEditor } from './recording-note-editor'
import { saveLocalRecording } from '../lib/recording-store'
import { RecordingRecovery, recordingAfterRetry, type RecoveryStage } from '../../../shared/record/Recovery'

export function RecordingCloud({ recording, changed }: { recording: LocalRecording; changed: (recording: LocalRecording) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [playback, setPlayback] = useState<RecordingPlayback>()
  const [copied, setCopied] = useState(false)
  const current = useRef(recording)
  current.current = recording
  const needsNoteRepair = !recording.cloud && recording.marks.some(mark => mark.text && mark.text.length > MAX_RECORDING_NOTE_LENGTH)
  async function upload(candidate = current.current, reupload = false) {
    if (!candidate.cloud && candidate.marks.some(mark => mark.text && mark.text.length > MAX_RECORDING_NOTE_LENGTH)) return
    setBusy(true); setError('')
    try {
      const updated = await syncRecording(candidate, changed, reupload)
      if (updated.cloud?.deleted) setPlayback(undefined)
    }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function saveNotes(marks: RecordingMark[]) {
    const updated = { ...current.current, marks, title: captureRecordingTitle(marks, current.current.pageTitle || current.current.title) }
    await saveLocalRecording(updated)
    changed(updated)
    await upload(updated)
  }
  useEffect(() => { void upload() }, [recording.id])
  useEffect(() => {
    if (!recording.cloud?.finalized || recording.cloud.deleted) return
    let disposed = false
    async function refresh() {
      try {
        const result = await readRecordingPlayback(current.current.cloud!.id)
        if (disposed) return
        setPlayback(result); setError('')
        const transcriptStage = result.stages.find(stage => stage.stage === 'transcription')
        const updated: LocalRecording = { ...current.current, transcript: result.transcript.map(s => ({ id: s.id, startMs: s.start_ms, endMs: s.end_ms, text: s.text })), transcriptionStatus: transcriptStage?.state === 'done' ? 'ready' : transcriptStage?.state === 'failed' ? 'failed' : 'processing' }
        await saveLocalRecording(updated)
        if (!disposed) changed(updated)
      } catch (error) {
        if (disposed) return
        if (isMissingCloudRecording(error)) { await upload(); return }
        setError((error as Error).message)
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 10_000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [recording.cloud?.id, recording.cloud?.finalized, recording.cloud?.deleted])
  async function copyLink() {
    try {
      const current = await ownerRecordRequest<{ shareId: string | null }>(`recordings/${recording.cloud!.id}/share`)
      if (!current.shareId) { setError('Sharing is off. Enable it from Share in the dashboard.'); return }
      await navigator.clipboard.writeText(recordingShareUrl(import.meta.env.WXT_DASHBOARD_URL, current.shareId))
      setCopied(true)
    } catch { setError('Could not copy the link. Try again.') }
  }
  async function retryProcessing(stage: RecoveryStage) {
    await ownerRecordRequest(`recordings/${recording.cloud!.id}/retry`, { stage })
    setPlayback(current => recordingAfterRetry(current, stage))
  }
  return <section className="review-summary" aria-label="Recording upload">
    <div><strong>{busy ? 'Uploading recording…' : recording.cloud?.deleted ? 'Cloud recording deleted' : playback ? `Recording ${playback.recording.state}` : recording.cloud?.finalized ? 'Recording processing' : 'Saved in this browser'}</strong>
      <p>{recording.cloud?.deleted ? 'Your local copy is kept. Upload again to create a new cloud recording and share link.' : recording.cloud?.finalized ? 'Your video is stored privately. Preparation status appears below.' : 'Your local copy stays available until the upload succeeds.'}</p>
      {error && <p role="alert">{error}</p>}
      {recording.cloud?.deleted && <button disabled={busy} onClick={() => { void upload(current.current, true) }}>Upload again</button>}
      {needsNoteRepair && <RecordingNoteEditor key={recording.id} marks={recording.marks} save={saveNotes} />}
      {!busy && !recording.cloud?.finalized && !recording.cloud?.deleted && !needsNoteRepair && <button onClick={() => { void upload() }}>Retry upload</button>}
      {error.startsWith('Sign in') && <button onClick={() => { void browser.runtime.sendMessage({ type: 'auth:open-popup' }) }}>Sign in to CRRT</button>}
      {!recording.cloud?.deleted && recording.cloud?.shareId && <button onClick={() => { void copyLink() }}>{copied ? 'Share link copied' : 'Copy share link'}</button>}
      {!recording.cloud?.deleted && playback && <RecordingRecovery stages={playback.stages} retry={retryProcessing} />}
    </div>
  </section>
}

export function RecordingAgentContext({ recording }: { recording: LocalRecording }) {
  const [payload, setPayload] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const requestKey = useRef(crypto.randomUUID())
  async function generate() {
    setError('')
    try {
      const result = await ownerRecordRequest(`recordings/${recording.cloud!.id}/agent-payload`, { requestKey: requestKey.current })
      setPayload(JSON.stringify(result, null, 2))
    } catch (error) { setError((error as Error).message) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(payload); setCopied(true) }
    catch { setError('Copy failed. Try again.') }
  }
  return <div className="agent-context"><strong>Agent context</strong><p>Transcript, keyframes, marks, DOM targets and current project instructions. Requires a paid plan.</p>
    <button disabled={!recording.cloud?.finalized || recording.cloud.deleted} onClick={() => { void generate() }}>Generate agent context</button>
    {error && <p role="alert">{error}</p>}
    {payload && <><pre>{payload}</pre><button onClick={() => { void copy() }}>{copied ? 'Copied for agent' : 'Copy for agent'}</button></>}
  </div>
}
