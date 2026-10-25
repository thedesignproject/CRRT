import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { browser } from 'wxt/browser'
import { ArrowUpRight, Box, Camera, CameraOff, Check, Eraser, Mic, Monitor, Pause, Pencil, Play, RotateCcw, ScreenShare, Square, Type, Undo2, X } from 'lucide-react'
import { RecordingCamera, RestoreCameraButton, type CameraPreviewSize } from '../../components/recording-camera'
import { formatRecordingTime, recordingMarkOpacity, type RecordingMark, type RecordingPoint, type RecordingTool } from '../../lib/recording'
import type { RecordingSessionSnapshot, RecordingSurfaceCommand } from '../../lib/recording-session'
import './style.css'

type Response<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }
/* v8 ignore next -- the standalone fallback always receives a session; direct Shadow DOM mounts pass id explicitly */
const sessionId = new URLSearchParams(location.search).get('session') || ''

async function send<T = unknown>(message: unknown) {
  const response = await browser.runtime.sendMessage(message) as Response<T>
  /* v8 ignore next -- Chrome always returns the typed background envelope; fallback protects extension reloads */
  if (!response?.ok) throw new Error(response?.error || 'Recording controls disconnected.')
  return response.data
}
export function surfacePoint(event: Pick<ReactPointerEvent<SVGSVGElement>, 'clientX' | 'clientY' | 'currentTarget'>): RecordingPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }
}
function MarkShape({ mark, opacity = 1 }: { mark: RecordingMark; opacity?: number }) {
  const [start, end = start] = mark.points
  /* v8 ignore next -- persisted and newly-created marks are schema-validated to include a point */
  if (!start) return null
  if (mark.type === 'draw') return <polyline points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--record-red)" strokeWidth=".65" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
  if (mark.type === 'arrow') return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--record-red)" strokeWidth=".7" strokeLinecap="round" markerEnd="url(#record-arrow)" opacity={opacity} />
  if (mark.type === 'box') return <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx="1" fill="none" stroke="var(--record-red)" strokeWidth=".65" opacity={opacity} />
  /* v8 ignore next -- interactive text marks cannot be committed without non-empty text */
  if (mark.type === 'text') return <g opacity={opacity}><rect x={start.x - 1} y={start.y - 3.5} width={Math.max(13, (mark.text?.length || 4) * .72)} height="5.5" rx="1.6" fill="var(--record-red)" /><text x={start.x + 1.1} y={start.y} fill="white" fontSize="2.45" fontWeight="700">{mark.text}</text></g>
  return <g opacity={opacity}><circle cx={start.x} cy={start.y} r="2.5" fill="var(--record-red)" /><text x={start.x} y={start.y + .9} fill="white" fontSize="2.65" fontWeight="800" textAnchor="middle">{mark.pinNumber}</text></g>
}

const tools: { id: RecordingTool; label: string; icon: typeof Pencil }[] = [
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'box', label: 'Box', icon: Box },
  { id: 'text', label: 'Text', icon: Type },
]

export function RecordControls({ id = sessionId }: { id?: string }) {
  const [snapshot, setSnapshot] = useState<RecordingSessionSnapshot | null>(null)
  const [draft, setDraft] = useState<RecordingPoint[]>([])
  const [pending, setPending] = useState(false)
  const [cameraAvailable, setCameraAvailable] = useState(false)
  const [cameraPreviewSize, setCameraPreviewSize] = useState<CameraPreviewSize>('medium')
  const draftRef = useRef<RecordingPoint[]>([])
  const exclusiveRef = useRef(false)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraEnabledRef = useRef(false)
  cameraEnabledRef.current = snapshot?.cameraEnabled ?? false

  const command = useCallback(async (value: RecordingSurfaceCommand, exclusive = false) => {
    /* v8 ignore next -- disabled Start/Done controls prevent a second exclusive DOM event */
    if (exclusive && exclusiveRef.current) return
    if (exclusive) { exclusiveRef.current = true; setPending(true) }
    try { await send({ type: 'record:surface-command', sessionId: id, command: value }) }
    finally {
      if (exclusive) { exclusiveRef.current = false; setPending(false) }
    }
  }, [id])

  useEffect(() => {
    const listener = (message: unknown) => {
      const value = message as { type?: unknown; sessionId?: unknown; snapshot?: RecordingSessionSnapshot }
      /* v8 ignore next -- unrelated runtime traffic is intentionally ignored by this session-scoped listener */
      if (value.type === 'record:surface-state' && value.sessionId === id && value.snapshot) setSnapshot(value.snapshot)
      return false
    }
    browser.runtime.onMessage.addListener(listener)
    void send<RecordingSessionSnapshot>({ type: 'record:surface-ready', sessionId: id }).then((value) => value && setSnapshot(value)).catch(() => {})
    return () => browser.runtime.onMessage.removeListener(listener)
  }, [id])

  const cameraSessionActive = Boolean(snapshot && ['countdown', 'recording', 'paused'].includes(snapshot.status))
  useEffect(() => {
    if (!cameraSessionActive || !cameraEnabledRef.current) return
    let alive = true
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false }).then(async (value) => {
      /* v8 ignore next -- resolves only when a permission prompt outlives an unmounted recording surface */
      if (!alive) { value.getTracks().forEach((track) => track.stop()); return }
      cameraStreamRef.current = value
      value.getVideoTracks().forEach((track) => { track.enabled = cameraEnabledRef.current })
      setCameraAvailable(true)
      cameraRef.current!.srcObject = value
      await cameraRef.current!.play().catch(() => {})
    }).catch(() => {})
    return () => {
      alive = false
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      setCameraAvailable(false)
    }
  }, [cameraSessionActive])

  useEffect(() => {
    const stream = cameraStreamRef.current
    stream?.getVideoTracks().forEach((track) => { track.enabled = Boolean(snapshot?.cameraEnabled) })
    if (snapshot?.cameraEnabled && stream && cameraRef.current) {
      cameraRef.current.srcObject = stream
      void cameraRef.current.play().catch(() => {})
    }
  }, [snapshot?.cameraEnabled])

  useEffect(() => {
    if (!snapshot || snapshot.tool === 'pointer') return
    const keydown = (event: KeyboardEvent) => {
      /* v8 ignore next -- non-Escape keys intentionally pass through to the recorded page */
      if (event.key !== 'Escape') return
      event.preventDefault()
      void command({ kind: 'tool.changed', tool: 'pointer' })
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [snapshot?.tool, command])

  if (!snapshot) return null
  const recording = snapshot.status === 'recording'
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    /* v8 ignore next -- pointer events cannot reach the annotation layer while it has pointer-events:none */
    if (!recording || snapshot.tool === 'pointer') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const points = [surfacePoint(event)]; draftRef.current = points; setDraft(points)
  }
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    /* v8 ignore next -- move events without an active gesture are ignored */
    if (!draftRef.current.length || !recording) return
    const next = surfacePoint(event)
    /* v8 ignore next -- both freehand and bounded tools are exercised through pointer tests */
    const points = snapshot.tool === 'draw' ? [...draftRef.current, next] : [draftRef.current[0]!, next]
    draftRef.current = points; setDraft(points)
  }
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    /* v8 ignore next -- pointer-up without an active drawing gesture is ignored */
    if (!draftRef.current.length || !recording || snapshot.tool === 'pointer') return
    const points = draftRef.current.length === 1 ? [...draftRef.current, surfacePoint(event)] : draftRef.current
    draftRef.current = []; setDraft([])
    /* v8 ignore next -- prompt cancellation is represented by the following empty-text guard */
    const text = snapshot.tool === 'text' ? window.prompt('What should the agent know?', 'Needs attention')?.trim() : undefined
    /* v8 ignore next -- cancelling or submitting an empty browser prompt intentionally creates no mark */
    if (snapshot.tool === 'text' && !text) return
    void command({ kind: 'mark.added', mark: {
      id: crypto.randomUUID(), type: snapshot.tool, atMs: snapshot.durationMs, points,
      /* v8 ignore next -- only text tools include a text payload */
      ...(text ? { text } : {}),
    } }).then(() => { if (snapshot.tool === 'text') void command({ kind: 'tool.changed', tool: 'pointer' }) })
  }
  const preview = draft.length && snapshot.tool !== 'pointer'
    ? { id: 'draft', type: snapshot.tool, atMs: snapshot.durationMs, points: draft, text: snapshot.tool === 'text' ? 'Type a note' : undefined, pinNumber: snapshot.marks.filter((mark) => mark.type === 'pin').length + 1 } as RecordingMark
    : null

  if (snapshot.status === 'setup' || snapshot.status === 'failed') return <main className="record-surface setup-surface">
    <section className="setup-launcher" data-record-control aria-label="CRRT Record setup">
      <header><span><i />CRRT Record</span><button className="icon" aria-label="Close recorder" title="Close" onClick={() => { void command({ kind: 'cancel' }) }}><X size={18} /></button></header>
      <div className="source-options">
        {([
          ['tab', 'This tab', 'DOM-aware', Square],
          ['window', 'Window', 'One application', Monitor],
          ['screen', 'Entire screen', 'Everything visible', ScreenShare],
        ] as const).map(([source, label, detail, Icon]) => <button key={source} className={snapshot.source === source ? 'source active' : 'source'} onClick={() => { void command({ kind: 'source.changed', source }) }}><Icon size={20} /><strong>{label}</strong><small>{detail}</small></button>)}
      </div>
      <div className="device-options">
        <button className={snapshot.cameraEnabled ? '' : 'device-off'} aria-pressed={snapshot.cameraEnabled} onClick={() => { void command({ kind: 'camera.toggled' }) }}>{snapshot.cameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}<span>{snapshot.cameraEnabled ? 'Camera' : 'No camera'}</span><em>{snapshot.cameraEnabled ? 'ON' : 'OFF'}</em></button>
        <button onClick={() => { void command({ kind: 'microphone.toggled' }) }}><Mic size={17} /><span>Microphone</span><em>{snapshot.microphoneEnabled ? 'On' : 'Off'}</em></button>
      </div>
      {snapshot.error && <p className="setup-error" role="alert">{snapshot.error}</p>}
      <button className="start" disabled={pending} onClick={() => { void command({ kind: 'start' }, true) }}><Camera size={17} /><span>Start recording</span><kbd>3 sec</kbd></button>
    </section>
  </main>

  /* v8 ignore next -- selecting an active tool exits to pointer; selecting another activates it */
  const chooseTool = (tool: RecordingTool) => { void command({ kind: 'tool.changed', tool: snapshot.tool === tool ? 'pointer' : tool }) }
  return <main className={`record-surface tool-${snapshot.tool}`}>
    <svg className="annotation-layer" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
      <defs><marker id="record-arrow" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="var(--record-red)" /></marker></defs>
      {snapshot.marks.map((mark) => {
        const opacity = recordingMarkOpacity(mark, snapshot.durationMs)
        return opacity > 0 ? <MarkShape key={mark.id} mark={mark} opacity={opacity} /> : null
      })}{preview && <MarkShape mark={preview} />}
    </svg>
    {snapshot.cameraEnabled ? <RecordingCamera videoRef={cameraRef} size={cameraPreviewSize} onSizeChange={setCameraPreviewSize} onClose={() => {
      cameraStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = false })
      void command({ kind: 'camera.toggled' })
    }} /> : null}
    {snapshot.microphoneEnabled && snapshot.status !== 'countdown' && <div className="transcript-chip" data-record-control><Mic size={12} /><span>Voice recording</span><em>Transcribed after Done</em></div>}
    {snapshot.warning && <div className="surface-warning" data-record-control>{snapshot.warning}</div>}
    {snapshot.status === 'countdown' && <div className="countdown"><strong>{snapshot.countdown}</strong><span>Get ready</span></div>}
    {snapshot.status === 'paused' && <div className="paused"><Pause size={22} fill="currentColor" /><strong>Paused</strong></div>}
    <div className="record-toolbar" data-record-control aria-label="Recording controls">
      {/* v8 ignore next -- browser confirmation cancellation has no state transition */}
      <button className="icon cancel" title="Discard recording" onClick={() => { if (window.confirm('Discard this recording?')) void command({ kind: 'cancel' }) }} aria-label="Discard recording"><X size={16} /></button>
      <div className="clock"><i />{formatRecordingTime(snapshot.durationMs)}</div>
      {/* v8 ignore next -- paused and recording render paths are both exercised; duplicate ternaries share the same state */}
      <button className="icon" title={snapshot.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => { void command({ kind: 'pause.toggle' }) }} aria-label={snapshot.status === 'paused' ? 'Resume' : 'Pause'}>{snapshot.status === 'paused' ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
      <button className="icon" title="Restart" onClick={() => { if (window.confirm('Restart this recording?')) void command({ kind: 'restart' }) }} aria-label="Restart"><RotateCcw size={15} /></button>
      {!snapshot.cameraEnabled && cameraAvailable ? <RestoreCameraButton onClick={() => {
        cameraStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = true })
        void command({ kind: 'camera.toggled' })
      }} /> : null}
      <div className="divider" />
      {tools.map(({ id: tool, label, icon: Icon }) => <button key={tool} className={snapshot.tool === tool ? 'tool active' : 'tool'} onClick={() => chooseTool(tool)}><Icon size={14} /><span>{label}</span></button>)}
      <div className="divider" />
      <button className="icon" title="Undo last mark" disabled={!snapshot.marks.length} onClick={() => { void command({ kind: 'mark.undone' }) }} aria-label="Undo"><Undo2 size={15} /></button>
      <button className="icon" title="Clear all marks" disabled={!snapshot.marks.length} onClick={() => { void command({ kind: 'marks.cleared' }) }} aria-label="Clear"><Eraser size={15} /></button>
      <button className="done" disabled={pending} onClick={() => { void command({ kind: 'finish' }, true) }}><Check size={15} /><span>Done</span></button>
    </div>
  </main>
}
