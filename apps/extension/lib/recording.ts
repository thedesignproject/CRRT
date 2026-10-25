export type RecordingSource = 'tab' | 'window' | 'screen'
export type RecordingTool = 'pointer' | 'draw' | 'arrow' | 'box' | 'text' | 'pin'
export type RecordingStatus = 'setup' | 'countdown' | 'recording' | 'paused' | 'processing' | 'ready' | 'failed'

export type RecordingPoint = { x: number; y: number }

export type RecordingMark = {
  id: string
  type: Exclude<RecordingTool, 'pointer'>
  atMs: number
  points: RecordingPoint[]
  text?: string
  pinNumber?: number
  target?: {
    selector?: string
    pageUrl?: string
    tagName?: string
  }
}

export type RecordingTranscriptSegment = {
  id: string
  startMs: number
  endMs: number
  text: string
}

export type LocalRecording = {
  id: string
  title: string
  source: RecordingSource
  status: 'processing' | 'ready' | 'failed'
  pageUrl?: string
  pageTitle?: string
  durationMs: number
  createdAt: string
  authorName: string
  marks: RecordingMark[]
  transcript: RecordingTranscriptSegment[]
  screenBlob?: Blob
  cameraBlob?: Blob
  thumbnailDataUrl?: string
}

export type RecorderState = {
  status: RecordingStatus
  source: RecordingSource
  cameraEnabled: boolean
  microphoneEnabled: boolean
  countdown: number
  startedAt: number | null
  pausedAt: number | null
  pausedMs: number
  durationMs: number
  tool: RecordingTool
  marks: RecordingMark[]
  error: string | null
}

export type RecorderAction =
  | { type: 'source.changed'; source: RecordingSource }
  | { type: 'camera.toggled' }
  | { type: 'microphone.toggled' }
  | { type: 'countdown.started'; seconds?: number }
  | { type: 'countdown.ticked' }
  | { type: 'recording.started'; now: number }
  | { type: 'recording.paused'; now: number }
  | { type: 'recording.resumed'; now: number }
  | { type: 'recording.ticked'; now: number }
  | { type: 'tool.changed'; tool: RecordingTool }
  | { type: 'mark.added'; mark: RecordingMark }
  | { type: 'mark.undone' }
  | { type: 'marks.cleared' }
  | { type: 'recording.finished'; now: number }
  | { type: 'processing.ready' }
  | { type: 'recording.failed'; message: string }
  | { type: 'recording.restarted' }

export const initialRecorderState: RecorderState = {
  status: 'setup',
  source: 'tab',
  cameraEnabled: true,
  microphoneEnabled: true,
  countdown: 3,
  startedAt: null,
  pausedAt: null,
  pausedMs: 0,
  durationMs: 0,
  tool: 'pointer',
  marks: [],
  error: null,
}

function elapsed(state: RecorderState, now: number) {
  if (state.startedAt === null) return state.durationMs
  const end = state.pausedAt ?? now
  return Math.max(0, end - state.startedAt - state.pausedMs)
}

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case 'source.changed':
      return state.status === 'setup' || state.status === 'failed' ? { ...state, source: action.source } : state
    case 'camera.toggled':
      return state.status === 'setup' || state.status === 'failed' ? { ...state, cameraEnabled: !state.cameraEnabled } : state
    case 'microphone.toggled':
      return state.status === 'setup' || state.status === 'failed' ? { ...state, microphoneEnabled: !state.microphoneEnabled } : state
    case 'countdown.started':
      return state.status === 'setup' ? { ...state, status: 'countdown', countdown: action.seconds ?? 3, error: null } : state
    case 'countdown.ticked':
      return state.status === 'countdown' ? { ...state, countdown: Math.max(0, state.countdown - 1) } : state
    case 'recording.started':
      return state.status === 'countdown' ? { ...state, status: 'recording', startedAt: action.now, countdown: 0 } : state
    case 'recording.paused':
      return state.status === 'recording'
        ? { ...state, status: 'paused', pausedAt: action.now, durationMs: elapsed(state, action.now) }
        : state
    case 'recording.resumed':
      return state.status === 'paused' && state.pausedAt !== null
        ? { ...state, status: 'recording', pausedMs: state.pausedMs + Math.max(0, action.now - state.pausedAt), pausedAt: null }
        : state
    case 'recording.ticked':
      return state.status === 'recording' ? { ...state, durationMs: elapsed(state, action.now) } : state
    case 'tool.changed':
      return state.status === 'recording' || state.status === 'paused' ? { ...state, tool: action.tool } : state
    case 'mark.added':
      return state.status === 'recording' ? { ...state, marks: [...state.marks, action.mark] } : state
    case 'mark.undone':
      return state.status === 'recording' || state.status === 'paused' ? { ...state, marks: state.marks.slice(0, -1) } : state
    case 'marks.cleared':
      return state.status === 'recording' || state.status === 'paused' ? { ...state, marks: [] } : state
    case 'recording.finished':
      return state.status === 'recording' || state.status === 'paused'
        ? { ...state, status: 'processing', durationMs: elapsed(state, action.now), pausedAt: null, tool: 'pointer' }
        : state
    case 'processing.ready':
      return state.status === 'processing' ? { ...state, status: 'ready' } : state
    case 'recording.failed':
      return { ...state, status: 'failed', error: action.message }
    case 'recording.restarted':
      return { ...initialRecorderState, source: state.source, cameraEnabled: state.cameraEnabled, microphoneEnabled: state.microphoneEnabled }
    default:
      return state
  }
}

export function formatRecordingTime(valueMs: number) {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function nearestRecordingMark(marks: RecordingMark[], atMs: number, thresholdMs = 3_000) {
  const nearest = marks.reduce<RecordingMark | null>((best, mark) => (
    !best || Math.abs(mark.atMs - atMs) < Math.abs(best.atMs - atMs) ? mark : best
  ), null)
  return nearest && Math.abs(nearest.atMs - atMs) <= thresholdMs ? nearest : null
}

export function buildRecordingAgentPayload(recording: LocalRecording) {
  const lines = [
    `## CRRT capture · ${recording.pageTitle || recording.title} · ${formatRecordingTime(recording.durationMs)}`,
    `by ${recording.authorName}`,
    '',
  ]
  const moments = [...recording.transcript].sort((a, b) => a.startMs - b.startMs)
  moments.forEach((segment, index) => {
    const nearest = nearestRecordingMark(recording.marks, (segment.startMs + segment.endMs) / 2)
    lines.push(`[${formatRecordingTime(segment.startMs)}] keyframe_${String(index + 1).padStart(2, '0')}.png${nearest ? `  ${nearest.type}` : ''}`)
    if (nearest?.target?.selector) lines.push(`  target: ${nearest.target.selector}`)
    if (nearest?.text) lines.push(`  note: "${nearest.text}"`)
    lines.push(`  "${segment.text}"`, '')
  })
  return lines.join('\n').trim()
}
