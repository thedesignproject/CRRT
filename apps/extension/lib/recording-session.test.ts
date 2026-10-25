import { describe, expect, it } from 'vitest'
import { initialRecorderState } from './recording'
import { isRecordingSurfaceCommand, isRecordingTool, sessionSnapshot } from './recording-session'

describe('recording session protocol', () => {
  it('recognizes supported tools and rejects other values', () => {
    expect(isRecordingTool('draw')).toBe(true)
    expect(isRecordingTool('zoom')).toBe(false)
    expect(isRecordingTool(null)).toBe(false)
  })

  it('validates controller commands', () => {
    expect(isRecordingSurfaceCommand({ kind: 'finish' })).toBe(true)
    expect(isRecordingSurfaceCommand({ kind: 'source.changed', source: 'tab' })).toBe(true)
    expect(isRecordingSurfaceCommand({ kind: 'source.changed', source: 'camera' })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'tool.changed', tool: 'box' })).toBe(true)
    expect(isRecordingSurfaceCommand({ kind: 'tool.changed', tool: 'zoom' })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'transcript.segment-added', segment: { id: 's', startMs: 10, endMs: 30, text: 'Hello' } })).toBe(true)
    expect(isRecordingSurfaceCommand({ kind: 'transcript.segment-added', segment: { id: 's', startMs: 30, endMs: 10, text: 'Hello' } })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'transcript.segment-added', segment: { id: 's', startMs: 10, endMs: 30, text: ' ' } })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'mark.added', mark: { id: 'm', type: 'pin', atMs: 4, points: [{ x: 2, y: 3 }] } })).toBe(true)
    expect(isRecordingSurfaceCommand({ kind: 'mark.added', mark: { id: 'm', type: 'pin', atMs: 4, points: [] } })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'mark.added', mark: { id: 'm', type: 'pin', atMs: 4, points: [{ x: Number.NaN, y: 3 }] } })).toBe(false)
    expect(isRecordingSurfaceCommand({ kind: 'mark.added' })).toBe(false)
    expect(isRecordingSurfaceCommand(null)).toBe(false)
  })

  it('creates the serializable surface snapshot with an optional warning', () => {
    expect(sessionSnapshot(initialRecorderState)).toMatchObject({ status: 'setup', tool: 'pointer', marks: [] })
    expect(sessionSnapshot(initialRecorderState, 'Limited navigation')).toHaveProperty('warning', 'Limited navigation')
  })
})
