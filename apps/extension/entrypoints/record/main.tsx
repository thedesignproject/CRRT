import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import {
  ArrowUpRight, Box, Camera, CameraOff, Check, CircleDot, Copy, Eraser, Mic, Monitor,
  Pause, Pencil, Play, RotateCcw, ScreenShare, Square, Type, Undo2, Video, X,
} from 'lucide-react'
import { RecordingCamera, type CameraPreviewSize } from '../../components/recording-camera'
import { startRecordingCapture, type RecordingCapture } from '../../lib/recording-capture'
import {
  buildRecordingAgentPayload, formatRecordingTime, initialRecorderState, nearestRecordingMark, recordingMarkOpacity, recorderReducer,
  type LocalRecording, type RecordingMark, type RecordingPoint, type RecordingSource, type RecordingTool,
} from '../../lib/recording'
import { getLocalRecording, saveLocalRecording } from '../../lib/recording-store'
import { sessionSnapshot, type RecordingSurfaceCommand } from '../../lib/recording-session'
import { withRecordingTranscript } from '../../lib/recording-transcription'
import './style.css'

type Response = { ok: true; data?: unknown } | { ok: false; error: string }
type Target = NonNullable<RecordingMark['target']>

export async function send(message: unknown) {
  const response = await browser.runtime.sendMessage(message) as Response
  if (!response?.ok) throw new Error(response?.error || 'CRRT Record is unavailable.')
  return response.data
}

export function revokeRecordingUrls(screenUrl: string, cameraUrl: string) {
  if (screenUrl) URL.revokeObjectURL(screenUrl)
  if (cameraUrl) URL.revokeObjectURL(cameraUrl)
}

export function canResolveDomTarget(source: RecordingSource, tabId: number | null) {
  return source === 'tab' && tabId !== null
}

export function sourceLabel(source: RecordingSource) {
  return source === 'tab' ? 'This tab' : source === 'window' ? 'Window' : 'Entire screen'
}

export function recordingTitle(marks: RecordingMark[], pageTitle?: string) {
  return marks[0]?.text || pageTitle || 'Untitled recording'
}

type StoredRecording = Omit<LocalRecording, 'transcriptionStatus'> & Pick<Partial<LocalRecording>, 'transcriptionStatus'>

export function normalizeStoredRecording(recording: StoredRecording): LocalRecording {
  const legacyAuthError = recording.transcriptionError === 'Sign in to CRRT to transcribe this recording.'
  const transcriptionErrorCode = recording.transcriptionErrorCode ?? (legacyAuthError ? 'request-failed' : undefined)
  const transcriptionError = legacyAuthError ? 'Transcript is ready to retry.' : recording.transcriptionError
  if (recording.transcriptionStatus) return {
    ...recording,
    transcriptionStatus: recording.transcriptionStatus,
    ...(transcriptionError ? { transcriptionError } : {}),
    ...(transcriptionErrorCode ? { transcriptionErrorCode } : {}),
  }
  return {
    ...recording,
    transcriptionStatus: recording.transcript.length ? 'ready' : 'failed',
    ...(transcriptionError ? { transcriptionError } : {}),
    ...(transcriptionErrorCode ? { transcriptionErrorCode } : {}),
  }
}

export function captureThumbnail(video: HTMLVideoElement | null) {
  if (!video?.videoWidth || !video.videoHeight) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(960, video.videoWidth)
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  try { return canvas.toDataURL('image/jpeg', .78) } catch { return undefined }
}

function point(event: ReactPointerEvent<SVGSVGElement>): RecordingPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }
}

function MarkShape({ mark, opacity = 1 }: { mark: RecordingMark; opacity?: number }) {
  const [start, end = start] = mark.points
  /* v8 ignore next -- persisted and newly-created marks are schema-validated to include a point */
  if (!start) return null
  if (mark.type === 'draw') return <polyline points={mark.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--record-red)" strokeWidth=".65" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
  if (mark.type === 'arrow') return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--record-red)" strokeWidth=".7" strokeLinecap="round" markerEnd="url(#record-arrow)" opacity={opacity} />
  if (mark.type === 'box') return <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx="1" fill="none" stroke="var(--record-red)" strokeWidth=".65" opacity={opacity} />
  if (mark.type === 'text') return <g opacity={opacity}><rect x={start.x - 1} y={start.y - 3.5} width={Math.max(13, (mark.text?.length || 4) * .72)} height="5.5" rx="1.6" fill="var(--record-red)" /><text x={start.x + 1.1} y={start.y} fill="white" fontSize="2.45" fontWeight="700">{mark.text}</text></g>
  return <g opacity={opacity}><circle cx={start.x} cy={start.y} r="2.5" fill="var(--record-red)" /><text x={start.x} y={start.y + .9} fill="white" fontSize="2.65" fontWeight="800" textAnchor="middle">{mark.pinNumber}</text></g>
}

function Marks({ marks, atMs }: { marks: RecordingMark[]; atMs: number }) {
  return <>
    <defs><marker id="record-arrow" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="var(--record-red)" /></marker></defs>
    {marks.map((mark) => {
      const opacity = recordingMarkOpacity(mark, atMs)
      return opacity > 0 ? <MarkShape key={mark.id} mark={mark} opacity={opacity} /> : null
    })}
  </>
}

const tools: { id: RecordingTool; label: string; icon: typeof Pencil }[] = [
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'box', label: 'Box', icon: Box },
  { id: 'text', label: 'Text', icon: Type },
]

export function RecordApp() {
  const query = useMemo(() => new URLSearchParams(location.search), [])
  const tabId = Number(query.get('tabId')) || null
  const pageUrl = query.get('pageUrl') || undefined
  const pageTitle = query.get('pageTitle') || (pageUrl ? new URL(pageUrl).hostname : 'Untitled recording')
  const [state, dispatch] = useReducer(recorderReducer, { ...initialRecorderState, source: tabId === null ? 'window' : 'tab' })
  const stateRef = useRef(state)
  const captureRef = useRef<RecordingCapture | null>(null)
  const sessionRef = useRef<string | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const draftRef = useRef<RecordingPoint[]>([])
  const [draft, setDraft] = useState<RecordingPoint[]>([])
  const [recording, setRecording] = useState<LocalRecording | null>(null)
  const [screenUrl, setScreenUrl] = useState('')
  const [cameraUrl, setCameraUrl] = useState('')
  const [reviewTab, setReviewTab] = useState<'transcript' | 'agents'>('transcript')
  const [playbackMs, setPlaybackMs] = useState(0)
  const [copied, setCopied] = useState(false)
  const [sessionWarning, setSessionWarning] = useState<string>()
  const [cameraPreviewSize, setCameraPreviewSize] = useState<CameraPreviewSize>('medium')
  const cameraPreviewRef = useRef<HTMLVideoElement>(null)
  const reviewCameraRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => () => revokeRecordingUrls(screenUrl, cameraUrl), [screenUrl, cameraUrl])

  useEffect(() => {
    const recordingId = query.get('recording')
    if (!recordingId) return
    getLocalRecording(recordingId).then((stored) => {
      /* v8 ignore next -- a stale local recording URL intentionally leaves the setup screen intact */
      if (!stored) return
      setRecording(normalizeStoredRecording(stored))
      if (stored.screenBlob) setScreenUrl(URL.createObjectURL(stored.screenBlob))
      if (stored.cameraBlob) setCameraUrl(URL.createObjectURL(stored.cameraBlob))
    }).catch(() => {})
  }, [query])

  useEffect(() => {
    if (state.status !== 'recording') return
    const timer = window.setInterval(() => dispatch({ type: 'recording.ticked', now: performance.now() }), 200)
    return () => window.clearInterval(timer)
  }, [state.status])

  useEffect(() => {
    const stream = captureRef.current?.cameraStream
    if (!state.cameraEnabled || !stream || !cameraPreviewRef.current) return
    cameraPreviewRef.current.srcObject = stream
    void cameraPreviewRef.current.play().catch(() => {})
  }, [state.cameraEnabled])

  useEffect(() => {
    const sessionId = sessionRef.current
    if (!sessionId) return
    void send({ type: 'record:session-sync', sessionId, snapshot: sessionSnapshot(state, sessionWarning) }).catch(() => {})
  }, [sessionWarning, state])

  const resolveTarget = useCallback(async (at: RecordingPoint): Promise<Target | undefined> => {
    /* v8 ignore next -- only the tab-injected surface can emit DOM-target lookups */
    if (!canResolveDomTarget(stateRef.current.source, tabId)) return undefined
    try { return await send({ type: 'record:resolve-target', tabId, x: at.x, y: at.y }) as Target | undefined }
    catch { return undefined }
  }, [tabId])

  const finish = useCallback(async () => {
    const capture = captureRef.current
    if (!capture || !['recording', 'paused'].includes(stateRef.current.status)) return
    dispatch({ type: 'recording.finished', now: performance.now() })
    try {
      const blobs = await capture.stop()
      captureRef.current = null
      const current = stateRef.current
      const marks = current.marks
      const durationMs = Math.max(current.durationMs, 1_000)
      const saved: LocalRecording = {
        id: crypto.randomUUID(),
        title: recordingTitle(marks, pageTitle),
        source: current.source,
        status: 'processing',
        pageUrl,
        pageTitle,
        durationMs,
        createdAt: new Date().toISOString(),
        authorName: 'Tomás',
        marks,
        transcript: [],
        transcriptionStatus: 'processing',
        screenBlob: blobs.screenBlob,
        cameraBlob: blobs.cameraBlob,
        audioBlob: blobs.audioBlob,
        thumbnailDataUrl: captureThumbnail(previewRef.current),
      }
      await saveLocalRecording(saved)
      const completed = await withRecordingTranscript(saved)
      await saveLocalRecording(completed)
      const sessionId = sessionRef.current
      sessionRef.current = null
      if (sessionId) await send({ type: 'record:session-stop', sessionId }).catch(() => undefined)
      setRecording(completed)
      setScreenUrl(URL.createObjectURL(blobs.screenBlob))
      if (blobs.cameraBlob) setCameraUrl(URL.createObjectURL(blobs.cameraBlob))
      dispatch({ type: 'processing.ready' })
      history.replaceState(null, '', `${location.pathname}?recording=${completed.id}`)
    } catch (error) {
      dispatch({ type: 'recording.failed', message: error instanceof Error ? error.message : 'Could not finish this recording.' })
    }
  }, [pageTitle, pageUrl])

  async function start() {
    if (state.status === 'failed') {
      stateRef.current = recorderReducer(stateRef.current, { type: 'recording.restarted' })
      dispatch({ type: 'recording.restarted' })
    }
    let warning: string | undefined
    if (state.source === 'tab') {
      const granted = await browser.permissions.request({ origins: ['http://*/*', 'https://*/*'] }).catch(() => false)
      if (!granted) warning = 'Cross-site navigation may hide controls. Recording continues on this page.'
      setSessionWarning(warning)
    }
    const countdownState = recorderReducer(stateRef.current, { type: 'countdown.started' })
    stateRef.current = countdownState
    dispatch({ type: 'countdown.started' })
    try {
      const tabStreamId = state.source === 'tab'
        ? await send({ type: 'record:tab-stream', tabId }) as string
        : undefined
      const capture = await startRecordingCapture({
        source: state.source,
        cameraEnabled: state.cameraEnabled,
        microphoneEnabled: state.microphoneEnabled,
        tabStreamId,
        deferRecording: true,
      })
      captureRef.current = capture
      // Acquire every permission in the initiating gesture, then keep the
      // recorder paused so the saved media and event timeline both begin at 0.
      capture.pause()
      if (previewRef.current) {
        previewRef.current.srcObject = capture.screenStream
        await previewRef.current.play()
      }
      if (cameraPreviewRef.current && capture.cameraStream) {
        cameraPreviewRef.current.srcObject = capture.cameraStream
        await cameraPreviewRef.current.play()
      }
      if (state.source === 'tab' && tabId !== null) {
        const sessionId = crypto.randomUUID()
        await send({ type: 'record:session-create', tabId, sessionId, snapshot: sessionSnapshot(countdownState, warning) })
        sessionRef.current = sessionId
      }
      capture.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stateRef.current.status === 'countdown') {
          captureRef.current = null
          void capture.stop()
          dispatch({ type: 'recording.failed', message: 'Screen sharing ended before recording started.' })
          return
        }
        void finish()
      }, { once: true })
      let count = 3
      const timer = window.setInterval(() => {
        count -= 1
        dispatch({ type: 'countdown.ticked' })
        if (count === 0) {
          window.clearInterval(timer)
          capture.resume()
          dispatch({ type: 'recording.started', now: performance.now() })
        }
      }, 1_000)
    } catch (error) {
      const failedCapture = captureRef.current
      captureRef.current = null
      if (failedCapture) await failedCapture.stop().catch(() => undefined)
      dispatch({ type: 'recording.failed', message: error instanceof Error ? error.message : 'Could not start recording.' })
    }
  }

  function togglePause() {
    if (state.status === 'recording') { captureRef.current?.pause(); dispatch({ type: 'recording.paused', now: performance.now() }) }
    else if (state.status === 'paused') { captureRef.current?.resume(); dispatch({ type: 'recording.resumed', now: performance.now() }) }
  }

  function setCameraDuringRecording(enabled: boolean) {
    const capture = captureRef.current
    if (!capture || !capture.setCameraEnabled(enabled)) return
    const next = recorderReducer(stateRef.current, { type: 'camera.toggled' })
    stateRef.current = next
    dispatch({ type: 'camera.toggled' })
  }

  async function restart() {
    const capture = captureRef.current
    captureRef.current = null
    if (capture) await capture.stop().catch(() => undefined)
    if (previewRef.current) previewRef.current.srcObject = null
    if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = null
    const sessionId = sessionRef.current
    sessionRef.current = null
    if (sessionId) await send({ type: 'record:session-stop', sessionId }).catch(() => undefined)
    dispatch({ type: 'recording.restarted' })
  }

  useEffect(() => {
    const listener = (message: unknown) => {
      const value = message as { type?: unknown; sessionId?: unknown; command?: RecordingSurfaceCommand; warning?: unknown }
      if (value.sessionId !== sessionRef.current) return false
      if (value.type === 'record:controller-warning' && typeof value.warning === 'string') {
        setSessionWarning(value.warning)
        return false
      }
      if (value.type !== 'record:controller-command' || !value.command) return false
      const command = value.command
      if (command.kind === 'pause.toggle') togglePause()
      else if (command.kind === 'camera.toggled') setCameraDuringRecording(!stateRef.current.cameraEnabled)
      else if (command.kind === 'restart') void restart()
      else if (command.kind === 'finish') void finish()
      else if (command.kind === 'tool.changed') dispatch({ type: 'tool.changed', tool: command.tool })
      else if (command.kind === 'mark.undone') dispatch({ type: 'mark.undone' })
      else if (command.kind === 'marks.cleared') dispatch({ type: 'marks.cleared' })
      else if (command.kind === 'mark.added') {
        const mark = command.mark, at = mark.points[mark.points.length - 1]
        if (at) void resolveTarget(at).then((target) => dispatch({ type: 'mark.added', mark: { ...mark, ...(target ? { target } : {}) } }))
      }
      return false
    }
    browser.runtime.onMessage.addListener(listener)
    return () => browser.runtime.onMessage.removeListener(listener)
  }, [finish, resolveTarget, state.status])

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (state.status !== 'recording' || state.tool === 'pointer') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = [point(event)]
    draftRef.current = next; setDraft(next)
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftRef.current.length || state.status !== 'recording') return
    const nextPoint = point(event)
    const next = state.tool === 'draw' ? [...draftRef.current, nextPoint] : [draftRef.current[0], nextPoint]
    draftRef.current = next; setDraft(next)
  }

  async function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftRef.current.length || state.status !== 'recording' || state.tool === 'pointer') return
    const points = draftRef.current.length === 1 ? [...draftRef.current, point(event)] : draftRef.current
    draftRef.current = []; setDraft([])
    const text = state.tool === 'text' ? window.prompt('What should the agent know?', 'Needs attention')?.trim() : undefined
    if (state.tool === 'text' && !text) return
    dispatch({ type: 'mark.added', mark: {
      id: crypto.randomUUID(),
      type: state.tool,
      atMs: state.durationMs,
      points,
      ...(text ? { text } : {}),
    } })
  }

  async function copyShare() {
    await navigator.clipboard.writeText(location.href)
    setCopied(true); window.setTimeout(() => setCopied(false), 1_600)
  }

  const retryTranscript = useCallback(async () => {
    /* v8 ignore next -- this callback is only exposed by Review after a failed recording exists */
    if (!recording || recording.transcriptionStatus === 'processing') return
    const processing = { ...recording, transcriptionStatus: 'processing' as const, transcriptionError: undefined, transcriptionErrorCode: undefined }
    setRecording(processing)
    await saveLocalRecording(processing)
    const completed = await withRecordingTranscript(processing)
    await saveLocalRecording(completed)
    setRecording(completed)
  }, [recording])

  if (recording) return <Review recording={recording} screenUrl={screenUrl} cameraUrl={recording.source === 'tab' ? '' : cameraUrl} cameraSize={cameraPreviewSize} tab={reviewTab} setTab={setReviewTab} playbackMs={playbackMs} setPlaybackMs={setPlaybackMs} cameraRef={reviewCameraRef} copied={copied} copyShare={copyShare} retryTranscript={retryTranscript} />

  if (state.status === 'setup' || state.status === 'failed') return <Setup state={state} tabAvailable={tabId !== null && Boolean(pageUrl?.startsWith('http'))} start={() => { void start() }} dispatch={dispatch} />

  if (state.source === 'tab') return <main className="controller-page"><div className="controller-card"><span className="controller-live"><i />Recording this tab</span><h1>Controls are on the page.</h1><p>Keep this window open. CRRT is recording in the background and will return here when you finish.</p><button onClick={() => {
    /* v8 ignore next -- tab recording cannot start unless setup has a concrete tab id */
    if (tabId !== null) void browser.tabs.update(tabId, { active: true })
  }}>Return to recorded tab</button></div></main>

  const previewMark: RecordingMark | null = draft.length && state.tool !== 'pointer'
    ? { id: 'draft', type: state.tool, atMs: state.durationMs, points: draft, pinNumber: state.marks.filter((mark) => mark.type === 'pin').length + 1, text: state.tool === 'text' ? 'Type a note' : undefined }
    : null
  return <main className="record-stage">
    <header className="record-stage-header"><div className="brand"><span>🥕</span><strong>CRRT Record</strong></div><div className="capture-live"><i />CRRT is recording {sourceLabel(state.source).toLowerCase()}</div></header>
    <section className="record-preview-shell">
      <video ref={previewRef} className="record-preview" muted playsInline />
      <svg className={`record-overlay tool-${state.tool}`} viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={(event) => { void pointerUp(event) }}>
        <Marks marks={state.marks} atMs={state.durationMs} />{previewMark && <MarkShape mark={previewMark} />}
      </svg>
      {state.cameraEnabled ? <RecordingCamera videoRef={cameraPreviewRef} size={cameraPreviewSize} onSizeChange={setCameraPreviewSize} onClose={() => setCameraDuringRecording(false)} /> : null}
      {state.microphoneEnabled && state.status !== 'countdown' && <div className="live-transcript"><Mic size={12} /><span>Voice recording</span><em>Transcribed after Done</em></div>}
      {state.status === 'countdown' && <div className="countdown"><span>{state.countdown}</span><p>Get ready</p></div>}
      {state.status === 'paused' && <div className="paused-screen"><Pause size={30} fill="currentColor" /><strong>Recording paused</strong></div>}
      {state.status === 'processing' && <div className="paused-screen processing"><span className="processing-ring" /><strong>Building your capture…</strong><small>Video is safe. Transcript and keyframes are next.</small></div>}
    </section>
    <div className="record-toolbar" aria-label="Recording controls">
      <div className="record-clock"><i />{formatRecordingTime(state.durationMs)}</div>
      <button className="icon-control" onClick={togglePause} aria-label={state.status === 'paused' ? 'Resume' : 'Pause'}>{state.status === 'paused' ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
      <button className="icon-control" onClick={() => { void restart() }} aria-label="Restart"><RotateCcw size={15} /></button>
      {!state.cameraEnabled && captureRef.current?.cameraStream ? <button className="icon-control" onClick={() => setCameraDuringRecording(true)} aria-label="Turn camera on" title="Turn camera on"><CameraOff size={15} /></button> : null}
      <div className="toolbar-divider" />
      {tools.map(({ id, label, icon: Icon }) => <button key={id} className={state.tool === id ? 'tool active' : 'tool'} onClick={() => dispatch({ type: 'tool.changed', tool: id })}><Icon size={14} /><span>{label}</span></button>)}
      <div className="toolbar-divider" />
      <button className="icon-control" onClick={() => dispatch({ type: 'mark.undone' })} aria-label="Undo" disabled={!state.marks.length}><Undo2 size={15} /></button>
      <button className="tool quiet" onClick={() => dispatch({ type: 'marks.cleared' })} disabled={!state.marks.length}><Eraser size={14} /><span>Clear</span></button>
      <button className="done" onClick={() => { void finish() }}><Check size={15} /><span>Done</span></button>
    </div>
  </main>
}

function Setup({ state, tabAvailable, start, dispatch }: { state: typeof initialRecorderState; tabAvailable: boolean; start: () => void; dispatch: React.Dispatch<Parameters<typeof recorderReducer>[1]> }) {
  const sources: { id: RecordingSource; label: string; note: string; icon: typeof Monitor }[] = [
    { id: 'tab', label: 'This tab', note: 'DOM-aware', icon: Square },
    { id: 'window', label: 'Window', note: 'One application', icon: Monitor },
    { id: 'screen', label: 'Entire screen', note: 'Everything visible', icon: ScreenShare },
  ]
  return <main className="setup-page">
    <header className="setup-header"><div className="brand"><span>🥕</span><strong>CRRT Record</strong></div><button className="close" onClick={() => window.close()} aria-label="Close"><X /></button></header>
    <section className="setup-card">
      <div className="setup-copy"><span className="setup-kicker"><CircleDot size={13} /> New recording</span><h1>Show it once.<br />Your agent reads it.</h1><p>Record your screen, talk through the problem, and mark what matters. CRRT keeps the video human and makes the context structured.</p></div>
      <div className="source-grid" role="radiogroup" aria-label="Capture source">
        {sources.map(({ id, label, note, icon: Icon }) => <button key={id} role="radio" aria-checked={state.source === id} disabled={id === 'tab' && !tabAvailable} className={state.source === id ? 'source active' : 'source'} onClick={() => dispatch({ type: 'source.changed', source: id })}><Icon size={21} /><strong>{label}</strong><small>{id === 'tab' && !tabAvailable ? 'Unavailable here' : note}</small>{id === 'tab' && <em>Best for agents</em>}</button>)}
      </div>
      <div className="device-options">
        <button className={state.cameraEnabled ? '' : 'device-off'} aria-pressed={state.cameraEnabled} onClick={() => dispatch({ type: 'camera.toggled' })}><span>{state.cameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}{state.cameraEnabled ? 'Camera' : 'No camera'}</span><strong className={state.cameraEnabled ? 'device-state on' : 'device-state off'}>{state.cameraEnabled ? 'ON' : 'OFF'}</strong></button>
        <button aria-pressed={state.microphoneEnabled} onClick={() => dispatch({ type: 'microphone.toggled' })}><span><Mic size={17} />Microphone</span><i className={state.microphoneEnabled ? 'switch on' : 'switch'} /></button>
      </div>
      {state.error && <p className="setup-error" role="alert">{state.error}</p>}
      <button className="start-recording" onClick={start}><Video size={18} /><span>Start recording</span><kbd>3 sec</kbd></button>
      <p className="privacy-note">Chrome will ask exactly what to share. Camera and microphone remain optional.</p>
    </section>
    <footer className="setup-footer"><span>Local recording</span><span>Voice uploads for transcription</span></footer>
  </main>
}

function Review({ recording, screenUrl, cameraUrl, cameraSize, tab, setTab, playbackMs, setPlaybackMs, cameraRef, copied, copyShare, retryTranscript }: {
  recording: LocalRecording; screenUrl: string; cameraUrl: string; cameraSize: CameraPreviewSize; tab: 'transcript' | 'agents'; setTab: (tab: 'transcript' | 'agents') => void; playbackMs: number; setPlaybackMs: (value: number) => void; cameraRef: React.RefObject<HTMLVideoElement | null>; copied: boolean; copyShare: () => Promise<void>
  retryTranscript: () => Promise<void>
}) {
  const player = useRef<HTMLVideoElement>(null)
  const [payloadCopyState, setPayloadCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const payload = buildRecordingAgentPayload(recording)
  function syncCamera() {
    const screen = player.current, camera = cameraRef.current
    /* v8 ignore next -- the callback can race either video ref during teardown */
    if (!screen || !camera) return
    /* v8 ignore next -- sub-frame drift does not require a camera seek */
    if (Math.abs(camera.currentTime - screen.currentTime) > .18) camera.currentTime = screen.currentTime
  }
  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload)
      setPayloadCopyState('copied')
    } catch {
      setPayloadCopyState('failed')
    }
  }
  return <main className="review-page">
    <header className="review-header"><div className="brand"><span>🥕</span><strong>CRRT</strong><i>/</i><span className="review-project">{recording.pageTitle}</span></div><div><span className="demo-chip">Local demo</span><button className="header-link" onClick={() => location.assign(new URL('/recordings.html', browser.runtime.getURL('/private.html')).toString())}>Recordings</button><button className="share-button" onClick={() => { void copyShare() }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy link'}</button></div></header>
    <div className="review-layout">
      <section className="review-main">
        <div className="player-shell">
          <video ref={player} src={screenUrl} controls playsInline onTimeUpdate={(event) => { setPlaybackMs(event.currentTarget.currentTime * 1_000); syncCamera() }} onPlay={() => { void cameraRef.current?.play() }} onPause={() => cameraRef.current?.pause()} />
          {recording.source !== 'tab' && <svg className="playback-marks" viewBox="0 0 100 100" preserveAspectRatio="none"><Marks marks={recording.marks} atMs={playbackMs} /></svg>}
          {cameraUrl && <video ref={cameraRef} src={cameraUrl} className={`camera-bubble playback-camera camera-size-${cameraSize}`} muted playsInline />}
        </div>
        <div className="timeline-markers">{recording.marks.map((mark) => <button key={mark.id} style={{ left: `${mark.atMs / recording.durationMs * 100}%` }} title={`${mark.type} at ${formatRecordingTime(mark.atMs)}`} onClick={() => { player.current!.currentTime = mark.atMs / 1000 }} />)}</div>
        <h1>{recording.title}</h1>
        <p className="review-meta">{recording.authorName} · {formatRecordingTime(recording.durationMs)} · {recording.marks.length} marks · just now</p>
        <div className="review-summary"><span>Capture ready</span><p>Human playback is local for this demo. The structured agent context below uses the same events the production backend will receive.</p></div>
      </section>
      <aside className="context-panel">
        <div className="context-tabs"><button className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcript</button><button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>For agents</button></div>
        {tab === 'transcript' ? <div className="transcript-list">
          {recording.transcriptionStatus === 'processing' && <div className="transcript-empty"><strong>Transcribing voice…</strong><p>Your recording is already saved locally.</p></div>}
          {recording.transcriptionStatus === 'failed' && <div className="transcript-empty"><strong>Transcript unavailable</strong><p>{recording.transcriptionError || 'CRRT could not transcribe this recording.'}</p>{recording.audioBlob?.size ? <button className="retry-transcript" onClick={() => { void retryTranscript() }}>Retry transcription</button> : null}</div>}
          {recording.transcriptionStatus === 'ready' && recording.transcript.length === 0 && <div className="transcript-empty"><strong>No speech detected</strong><p>The recording and marks are intact.</p></div>}
          {recording.transcript.map((segment) => {
          const mark = nearestRecordingMark(recording.marks, (segment.startMs + segment.endMs) / 2)
          /* v8 ignore next -- thumbnail/mark fallbacks are presentation-only variants of the tested transcript row */
          return <button key={segment.id} onClick={() => { if (player.current) player.current.currentTime = segment.startMs / 1000 }}><span className="keyframe-mini">{recording.thumbnailDataUrl ? <img src={recording.thumbnailDataUrl} alt="" /> : <Video size={14} />}</span><span><time>{formatRecordingTime(segment.startMs)}</time><p>{segment.text}</p>{mark && <small>{mark.target?.selector || mark.type}</small>}</span></button>
          })}</div> : <div className="agent-context"><div className="agent-callout"><strong>Ready for Claude Code</strong><p>Compact transcript, frames, marks and DOM targets. Project rules join here after backend integration.</p></div><pre>{payload}</pre><button onClick={() => { void copyPayload() }}><Copy size={15} />{payloadCopyState === 'copied' ? 'Copied for Claude Code' : 'Copy for Claude Code'}</button><small aria-live="polite">{payloadCopyState === 'failed' ? 'Copy failed. Try again.' : 'Demo preview · paid capability in production'}</small></div>}
      </aside>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<RecordApp />)
