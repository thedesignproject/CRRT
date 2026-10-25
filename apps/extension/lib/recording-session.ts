import type { RecorderState, RecordingMark, RecordingTool } from './recording'

export type RecordingSessionSnapshot = Pick<RecorderState,
  'status' | 'source' | 'cameraEnabled' | 'microphoneEnabled' | 'countdown' | 'durationMs' | 'tool' | 'marks' | 'error'> & {
    warning?: string
  }

export type RecordingSurfaceCommand =
  | { kind: 'pause.toggle' }
  | { kind: 'restart' }
  | { kind: 'finish' }
  | { kind: 'tool.changed'; tool: RecordingTool }
  | { kind: 'mark.added'; mark: RecordingMark }
  | { kind: 'mark.undone' }
  | { kind: 'marks.cleared' }

export type RecordingSessionDescriptor = {
  sessionId: string
  revision: number
  tabId: number
  controllerTabId: number
  controllerWindowId: number
  snapshot: RecordingSessionSnapshot
}

const tools: RecordingTool[] = ['pointer', 'draw', 'arrow', 'box', 'text', 'pin']

export function isRecordingTool(value: unknown): value is RecordingTool {
  return typeof value === 'string' && tools.includes(value as RecordingTool)
}

export function isRecordingSurfaceCommand(value: unknown): value is RecordingSurfaceCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Partial<RecordingSurfaceCommand> & { kind?: unknown }
  if (['pause.toggle', 'restart', 'finish', 'mark.undone', 'marks.cleared'].includes(String(command.kind))) return true
  if (command.kind === 'tool.changed') return isRecordingTool(command.tool)
  if (command.kind !== 'mark.added' || !command.mark || typeof command.mark !== 'object') return false
  const mark = command.mark as Partial<RecordingMark>
  return typeof mark.id === 'string'
    && ['draw', 'arrow', 'box', 'text', 'pin'].includes(String(mark.type))
    && typeof mark.atMs === 'number'
    && Array.isArray(mark.points)
    && mark.points.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
}

export function sessionSnapshot(state: RecorderState, warning?: string): RecordingSessionSnapshot {
  return {
    status: state.status,
    source: state.source,
    cameraEnabled: state.cameraEnabled,
    microphoneEnabled: state.microphoneEnabled,
    countdown: state.countdown,
    durationMs: state.durationMs,
    tool: state.tool,
    marks: state.marks,
    error: state.error,
    ...(warning ? { warning } : {}),
  }
}
