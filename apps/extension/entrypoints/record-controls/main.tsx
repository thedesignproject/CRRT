import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { ArrowUpRight, Box, Check, Eraser, Mic, MousePointer2, Pause, Pencil, Pin, Play, RotateCcw, Type, Undo2 } from 'lucide-react'
import { formatRecordingTime, type RecordingMark, type RecordingPoint, type RecordingTool } from '../../lib/recording'
import type { RecordingSessionSnapshot, RecordingSurfaceCommand } from '../../lib/recording-session'
import './style.css'

type Response<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }
const sessionId = new URLSearchParams(location.search).get('session') || ''

async function send<T = unknown>(message: unknown) {
  const response = await browser.runtime.sendMessage(message) as Response<T>
  if (!response?.ok) throw new Error(response?.error || 'Recording controls disconnected.')
  return response.data
}

export function surfacePoint(event: Pick<ReactPointerEvent<SVGSVGElement>, 'clientX' | 'clientY' | 'currentTarget'>): RecordingPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }
}

function MarkShape({ mark }: { mark: RecordingMark }) {
  const [start, end = start] = mark.points
  if (!start) return null
  if (mark.type === 'draw') return <polyline points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--record-red)" strokeWidth=".65" strokeLinecap="round" strokeLinejoin="round" />
  if (mark.type === 'arrow') return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--record-red)" strokeWidth=".7" strokeLinecap="round" markerEnd="url(#record-arrow)" />
  if (mark.type === 'box') return <rect x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} rx="1" fill="none" stroke="var(--record-red)" strokeWidth=".65" />
  if (mark.type === 'text') return <g><rect x={start.x - 1} y={start.y - 3.5} width={Math.max(13, (mark.text?.length || 4) * .72)} height="5.5" rx="1.6" fill="var(--record-red)" /><text x={start.x + 1.1} y={start.y} fill="white" fontSize="2.45" fontWeight="700">{mark.text}</text></g>
  return <g><circle cx={start.x} cy={start.y} r="2.5" fill="var(--record-red)" /><text x={start.x} y={start.y + .9} fill="white" fontSize="2.65" fontWeight="800" textAnchor="middle">{mark.pinNumber}</text></g>
}

const tools: { id: RecordingTool; label: string; icon: typeof Pencil }[] = [
  { id: 'pointer', label: 'Point', icon: MousePointer2 },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'box', label: 'Box', icon: Box },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'pin', label: 'Pin', icon: Pin },
]

export function RecordControls({ id = sessionId }: { id?: string }) {
  const [snapshot, setSnapshot] = useState<RecordingSessionSnapshot | null>(null)
  const [draft, setDraft] = useState<RecordingPoint[]>([])
  const draftRef = useRef<RecordingPoint[]>([])
  const cameraRef = useRef<HTMLVideoElement>(null)

  const command = (value: RecordingSurfaceCommand) => { void send({ type: 'record:surface-command', sessionId: id, command: value }) }

  useEffect(() => {
    const listener = (message: unknown) => {
      const value = message as { type?: unknown; sessionId?: unknown; snapshot?: RecordingSessionSnapshot }
      if (value.type === 'record:surface-state' && value.sessionId === id && value.snapshot) setSnapshot(value.snapshot)
      return false
    }
    browser.runtime.onMessage.addListener(listener)
    void send<RecordingSessionSnapshot>({ type: 'record:surface-ready', sessionId: id }).then((value) => value && setSnapshot(value)).catch(() => {})
    return () => browser.runtime.onMessage.removeListener(listener)
  }, [id])

  useEffect(() => {
    if (!snapshot) return
    let previous = ''
    const report = () => {
      const rects = Array.from(document.querySelectorAll<HTMLElement>('[data-record-control]')).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width && rect.height ? [[rect.left, rect.top, rect.width, rect.height]] : []
      })
      const value = JSON.stringify({ tool: snapshot.tool, rects })
      if (value !== previous) {
        previous = value
        void send({ type: 'record:surface-layout', sessionId: id, tool: snapshot.tool, rects }).catch(() => {})
      }
    }
    report(); const timer = window.setInterval(report, 250)
    return () => window.clearInterval(timer)
  }, [id, snapshot])

  useEffect(() => {
    if (snapshot?.tool !== 'pointer') return
    const move = (event: MouseEvent) => { void send({ type: 'record:surface-pointer', sessionId: id, x: event.clientX, y: event.clientY }).catch(() => {}) }
    document.addEventListener('mousemove', move)
    return () => document.removeEventListener('mousemove', move)
  }, [id, snapshot?.tool])

  useEffect(() => {
    if (!snapshot?.cameraEnabled || !['countdown', 'recording', 'paused'].includes(snapshot.status)) return
    let stream: MediaStream | null = null, alive = true
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false }).then(async (value) => {
      if (!alive) { value.getTracks().forEach((track) => track.stop()); return }
      stream = value
      if (cameraRef.current) { cameraRef.current.srcObject = value; await cameraRef.current.play().catch(() => {}) }
    }).catch(() => {})
    return () => { alive = false; stream?.getTracks().forEach((track) => track.stop()) }
  }, [snapshot?.cameraEnabled, snapshot?.status])

  if (!snapshot) return null
  const recording = snapshot.status === 'recording'
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!recording || snapshot.tool === 'pointer') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const points = [surfacePoint(event)]; draftRef.current = points; setDraft(points)
  }
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draftRef.current.length || !recording) return
    const next = surfacePoint(event)
    const points = snapshot.tool === 'draw' ? [...draftRef.current, next] : [draftRef.current[0]!, next]
    draftRef.current = points; setDraft(points)
  }
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draftRef.current.length || !recording || snapshot.tool === 'pointer') return
    const points = draftRef.current.length === 1 ? [...draftRef.current, surfacePoint(event)] : draftRef.current
    draftRef.current = []; setDraft([])
    const text = snapshot.tool === 'text' ? window.prompt('What should the agent know?', 'Needs attention')?.trim() : undefined
    if (snapshot.tool === 'text' && !text) return
    command({ kind: 'mark.added', mark: {
      id: crypto.randomUUID(), type: snapshot.tool, atMs: snapshot.durationMs, points,
      ...(text ? { text } : {}),
      ...(snapshot.tool === 'pin' ? { pinNumber: snapshot.marks.filter((mark) => mark.type === 'pin').length + 1 } : {}),
    } })
  }
  const preview = draft.length && snapshot.tool !== 'pointer'
    ? { id: 'draft', type: snapshot.tool, atMs: snapshot.durationMs, points: draft, text: snapshot.tool === 'text' ? 'Type a note' : undefined, pinNumber: snapshot.marks.filter((mark) => mark.type === 'pin').length + 1 } as RecordingMark
    : null

  return <main className={`record-surface tool-${snapshot.tool}`}>
    <svg className="annotation-layer" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
      <defs><marker id="record-arrow" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="var(--record-red)" /></marker></defs>
      {snapshot.marks.map((mark) => <MarkShape key={mark.id} mark={mark} />)}{preview && <MarkShape mark={preview} />}
    </svg>
    {snapshot.cameraEnabled && <div className="camera-shell" data-record-control><video ref={cameraRef} muted playsInline /><span>Camera</span></div>}
    {snapshot.microphoneEnabled && snapshot.status !== 'countdown' && <div className="transcript-chip" data-record-control><Mic size={12} /><span>{snapshot.durationMs < 4_000 ? 'Listening…' : '“Show the part you want to change.”'}</span><em>Live preview</em></div>}
    {snapshot.warning && <div className="surface-warning" data-record-control>{snapshot.warning}</div>}
    {snapshot.status === 'countdown' && <div className="countdown"><strong>{snapshot.countdown}</strong><span>Get ready</span></div>}
    {snapshot.status === 'paused' && <div className="paused"><Pause size={22} fill="currentColor" /><strong>Paused</strong></div>}
    <div className="record-toolbar" data-record-control aria-label="Recording controls">
      <div className="clock"><i />{formatRecordingTime(snapshot.durationMs)}</div>
      <button className="icon" onClick={() => command({ kind: 'pause.toggle' })} aria-label={snapshot.status === 'paused' ? 'Resume' : 'Pause'}>{snapshot.status === 'paused' ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
      <button className="icon" onClick={() => command({ kind: 'restart' })} aria-label="Restart"><RotateCcw size={15} /></button>
      <div className="divider" />
      {tools.map(({ id: tool, label, icon: Icon }) => <button key={tool} className={snapshot.tool === tool ? 'tool active' : 'tool'} onClick={() => command({ kind: 'tool.changed', tool })}><Icon size={14} /><span>{label}</span></button>)}
      <div className="divider" />
      <button className="icon" disabled={!snapshot.marks.length} onClick={() => command({ kind: 'mark.undone' })} aria-label="Undo"><Undo2 size={15} /></button>
      <button className="tool quiet" disabled={!snapshot.marks.length} onClick={() => command({ kind: 'marks.cleared' })}><Eraser size={14} /><span>Clear</span></button>
      <button className="done" onClick={() => command({ kind: 'finish' })}><Check size={15} /><span>Done</span></button>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<RecordControls />)
