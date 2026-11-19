import { useEffect, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import { recordingShareUrl, type RecordingPlayback } from '../../../shared/record/client'
import { attachRecordingProject, isMissingCloudRecording, ownerRecordRequest, readRecordingPlayback, syncRecording } from '../lib/recording-cloud'
import { listExtensionProjects } from '../lib/comments-api'
import { resolveProjectForPage, type ExtensionProject } from '../lib/project-context'
import { captureRecordingTitle, MAX_RECORDING_NOTE_LENGTH, type LocalRecording, type RecordingMark } from '../lib/recording'
import { RecordingNoteEditor } from './recording-note-editor'
import { saveLocalRecording } from '../lib/recording-store'
import { RecordingRecovery, recordingAfterRetry, type RecoveryStage } from '../../../shared/record/Recovery'

// Mirrors the server's attach rule: guests and members of admin-only private
// projects (which only receive `feedback:create`) cannot move recordings there.
export function canAttachRecording(project: ExtensionProject) {
  return project.capabilities ? project.capabilities.includes('feedback:manage') : project.role !== 'guest'
}

// The server still runs a no-op transcription stage when consent is off; that is not "transcribing".
export function cloudTranscriptionStatus(recording: LocalRecording, stage: string | undefined): LocalRecording['transcriptionStatus'] {
  if (!recording.hostedTranscription) return 'ready'
  return stage === 'done' ? 'ready' : stage === 'failed' ? 'failed' : 'processing'
}

export function RecordingCloud({ recording, changed }: { recording: LocalRecording; changed: (recording: LocalRecording) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [playback, setPlayback] = useState<RecordingPlayback>()
  const [copied, setCopied] = useState(false)
  const current = useRef(recording)
  // Adopt a new prop, but don't let a re-render discard a newer merged copy.
  const lastProp = useRef(recording)
  if (lastProp.current !== recording) { lastProp.current = recording; current.current = recording }
  const [projects, setProjects] = useState<ExtensionProject[]>([])
  const [projectKey, setProjectKey] = useState(recording.projectKey)
  const [projectError, setProjectError] = useState('')
  // Only a capture that has never been uploaded may adopt the page's default project.
  // Reopened cloud recordings keep whatever the server already has.
  const startedLocal = useRef(!recording.cloud)
  // Keep the ref current between a save and the next render so concurrent writers merge.
  const remember = (next: LocalRecording) => { current.current = next; changed(next) }
  useEffect(() => {
    let disposed = false
    void (async () => {
      const available = (await listExtensionProjects()).filter(canAttachRecording)
      if (disposed) return
      setProjects(available)
      const latest = current.current
      if (latest.projectKey !== undefined) return
      if (!startedLocal.current) {
        if (!latest.cloud || latest.cloud.deleted) return
        const server = await ownerRecordRequest<{ recording: { projectKey?: string | null } }>(`recordings/${latest.cloud.id}`)
        const key = server.recording.projectKey ?? null
        const confirmed = { ...current.current, projectKey: key, cloud: current.current.cloud && { ...current.current.cloud, projectKey: key } }
        await saveLocalRecording(confirmed)
        if (disposed) return
        remember(confirmed)
        setProjectKey(key)
        return
      }
      // Default to the same destination the popup uses for comments on this site.
      const selected = latest.pageUrl ? await resolveProjectForPage(latest.pageUrl, available) : null
      if (!disposed) setProjectKey(selected?.publicKey ?? null)
    })().catch(() => undefined)
    return () => { disposed = true }
  }, [recording.id])
  useEffect(() => {
    const target = current.current
    // Uploads persist their own copy of the recording, so attach once they settle.
    if (projectKey === undefined || busy || !target.cloud || target.cloud.deleted) return
    if (target.projectKey === projectKey && target.cloud.projectKey === projectKey) return
    let disposed = false
    void attachRecordingProject(target, projectKey).then(async () => {
      if (disposed) return
      const latest = current.current
      const updated = { ...latest, projectKey, cloud: latest.cloud && { ...latest.cloud, projectKey } }
      await saveLocalRecording(updated)
      if (!disposed) remember(updated)
    }).catch(() => {
      if (disposed) return
      // Show the project the server still has, and keep the message past status polling.
      setProjectKey(current.current.cloud?.projectKey ?? current.current.projectKey ?? null)
      setProjectError('Could not move this recording to that project. Try again.')
    })
    return () => { disposed = true }
  }, [projectKey, busy, recording.cloud?.id, recording.cloud?.deleted])
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
        const latest = current.current
        const updated: LocalRecording = { ...latest, transcript: result.transcript.map(s => ({ id: s.id, startMs: s.start_ms, endMs: s.end_ms, text: s.text })), transcriptionStatus: cloudTranscriptionStatus(latest, transcriptStage?.state) }
        current.current = updated
        await saveLocalRecording(updated)
        if (!disposed) remember(updated)
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
  const actions = [
    recording.cloud?.deleted && <button key="reupload" disabled={busy} onClick={() => { void upload(current.current, true) }}>Upload again</button>,
    !busy && !recording.cloud?.finalized && !recording.cloud?.deleted && !needsNoteRepair && <button key="retry" onClick={() => { void upload() }}>Retry upload</button>,
    error.startsWith('Sign in') && <button key="sign-in" onClick={() => { void browser.runtime.sendMessage({ type: 'auth:open-popup' }) }}>Sign in to CRRT</button>,
    !recording.cloud?.deleted && recording.cloud?.shareId && <button key="share" onClick={() => { void copyLink() }}>{copied ? 'Share link copied' : 'Copy share link'}</button>,
  ].filter(Boolean)
  const status = busy ? 'Uploading recording…' : recording.cloud?.deleted ? 'Cloud recording deleted' : playback ? `Recording ${playback.recording.state}` : recording.cloud?.finalized ? 'Recording processing' : 'Saved in this browser'
  const tone = busy || (!playback && recording.cloud?.finalized) || playback?.recording.state === 'processing' || playback?.recording.state === 'uploading' ? 'busy'
    : recording.cloud?.deleted || playback?.recording.state === 'failed' ? 'warn' : playback?.recording.state === 'ready' ? 'ready' : 'idle'
  const note = recording.cloud?.deleted ? 'Your local copy is kept. Upload again to create a new cloud recording and share link.'
    : !recording.cloud?.finalized && !busy ? 'Your local copy stays available until the upload succeeds.' : ''
  return <section className="recording-cloud" aria-label="Recording upload">
    <div className="recording-cloud-bar">
      <span className="recording-status" data-tone={tone} role="status"><i aria-hidden="true" />{status}</span>
      {projects.length > 0 && <label className="recording-project"><span>Project</span>
        <select aria-label="Recording project" value={projectKey ?? ''} disabled={projectKey === undefined || recording.cloud?.deleted} onChange={event => { setProjectError(''); setProjectKey(event.target.value || null) }}>
          <option value="">Private (only you)</option>
          {projects.map(project => <option key={project.publicKey} value={project.publicKey}>{project.name}</option>)}
        </select>
      </label>}
      {actions.length > 0 && <div className="recording-cloud-actions">{actions}</div>}
    </div>
    {note && <p className="recording-cloud-note">{note}</p>}
    {projectError && <p role="alert" className="recording-cloud-error">{projectError}</p>}
    {error && <p role="alert" className="recording-cloud-error">{error}</p>}
    {needsNoteRepair && <RecordingNoteEditor key={recording.id} marks={recording.marks} save={saveNotes} />}
    {!recording.cloud?.deleted && playback && <RecordingRecovery stages={playback.stages} retry={retryProcessing} />}
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
