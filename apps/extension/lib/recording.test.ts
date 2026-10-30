import { describe, expect, it } from 'vitest'
import { buildRecordingAgentPayload, formatRecordingTime, initialRecorderState, nearestRecordingMark, recordingMarkOpacity, recorderReducer, type LocalRecording } from './recording'

describe('recorder state', () => {
  it('tracks countdown, pauses, duration, marks, processing, and restart', () => {
    let state = recorderReducer(initialRecorderState, { type: 'source.changed', source: 'screen' })
    state = recorderReducer(state, { type: 'countdown.started' })
    state = recorderReducer(state, { type: 'countdown.ticked' })
    state = recorderReducer(state, { type: 'recording.started', now: 1_000 })
    state = recorderReducer(state, { type: 'recording.ticked', now: 5_000 })
    state = recorderReducer(state, { type: 'mark.added', mark: { id: 'm1', type: 'pin', atMs: 4_000, points: [{ x: 20, y: 30 }] } })
    state = recorderReducer(state, { type: 'recording.paused', now: 6_000 })
    state = recorderReducer(state, { type: 'recording.resumed', now: 9_000 })
    state = recorderReducer(state, { type: 'recording.finished', now: 11_000 })
    expect(state).toMatchObject({ source: 'screen', status: 'processing', durationMs: 7_000, marks: [{ id: 'm1' }] })
    expect(recorderReducer(state, { type: 'processing.ready' }).status).toBe('ready')
    expect(recorderReducer(state, { type: 'recording.restarted' })).toMatchObject({ status: 'setup', source: 'screen', marks: [] })
  })

  it('ignores invalid transitions and preserves setup choices across a restart', () => {
    const recording = recorderReducer(initialRecorderState, { type: 'recording.started', now: 0 })
    expect(recording).toEqual(initialRecorderState)
    const withoutCamera = recorderReducer(initialRecorderState, { type: 'camera.toggled' })
    expect(recorderReducer({ ...withoutCamera, status: 'recording' }, { type: 'camera.toggled' }).cameraEnabled).toBe(true)
    const processing = { ...withoutCamera, status: 'processing' as const }
    expect(recorderReducer(processing, { type: 'camera.toggled' })).toBe(processing)
    expect(recorderReducer({ ...withoutCamera, status: 'recording' }, { type: 'recording.restarted' }).cameraEnabled).toBe(false)
  })

  it('lets the user change capture settings after a permission failure', () => {
    const failed = recorderReducer(initialRecorderState, { type: 'recording.failed', message: 'denied' })
    const source = recorderReducer(failed, { type: 'source.changed', source: 'screen' })
    const camera = recorderReducer(source, { type: 'camera.toggled' })
    const microphone = recorderReducer(camera, { type: 'microphone.toggled' })

    expect(microphone).toMatchObject({ status: 'failed', source: 'screen', cameraEnabled: false, microphoneEnabled: false })
  })

  it('handles annotation tools and ignores them outside active recording states', () => {
    const active = { ...initialRecorderState, status: 'recording' as const, marks: [{ id: 'm1', type: 'box' as const, atMs: 0, points: [] }] }
    expect(recorderReducer(active, { type: 'tool.changed', tool: 'draw' }).tool).toBe('draw')
    expect(recorderReducer(active, { type: 'mark.undone' }).marks).toEqual([])
    expect(recorderReducer(active, { type: 'marks.cleared' }).marks).toEqual([])
    expect(recorderReducer(initialRecorderState, { type: 'tool.changed', tool: 'draw' })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: 'mark.undone' })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: 'marks.cleared' })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: 'unknown' } as never)).toBe(initialRecorderState)
  })

  it('guards every state-specific transition and duration edge', () => {
    const recording = { ...initialRecorderState, status: 'recording' as const, startedAt: 1_000 }
    const paused = { ...recording, status: 'paused' as const, pausedAt: 2_000, durationMs: 1_000 }
    const malformedPause = { ...paused, pausedAt: null }

    expect(recorderReducer(recording, { type: 'source.changed', source: 'screen' })).toBe(recording)
    expect(recorderReducer(recording, { type: 'microphone.toggled' })).toBe(recording)
    expect(recorderReducer(recording, { type: 'countdown.started', seconds: 5 })).toBe(recording)
    expect(recorderReducer(initialRecorderState, { type: 'countdown.started', seconds: 5 }).countdown).toBe(5)
    expect(recorderReducer(initialRecorderState, { type: 'countdown.ticked' })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: 'recording.paused', now: 2_000 })).toBe(initialRecorderState)
    expect(recorderReducer(recording, { type: 'recording.resumed', now: 2_000 })).toBe(recording)
    expect(recorderReducer(malformedPause, { type: 'recording.resumed', now: 2_000 })).toBe(malformedPause)
    expect(recorderReducer(paused, { type: 'recording.ticked', now: 3_000 })).toBe(paused)
    expect(recorderReducer(paused, { type: 'mark.added', mark: { id: 'x', type: 'draw', atMs: 0, points: [] } })).toBe(paused)
    expect(recorderReducer(initialRecorderState, { type: 'recording.finished', now: 3_000 })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: 'processing.ready' })).toBe(initialRecorderState)
    expect(recorderReducer(paused, { type: 'recording.finished', now: 3_000 })).toMatchObject({ status: 'processing', durationMs: 1_000 })
    expect(recorderReducer({ ...recording, startedAt: null, durationMs: 900 }, { type: 'recording.ticked', now: 5_000 }).durationMs).toBe(900)
  })
})

it('formats durations and creates a compact agent payload', () => {
  const recording: LocalRecording = {
    id: 'r1', title: 'Checkout review', source: 'tab', status: 'ready', durationMs: 42_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Sofia', pageTitle: 'Acme checkout',
    marks: [{ id: 'm1', type: 'box', atMs: 11_000, points: [], text: 'too dark', target: { selector: 'button.pay-cta' } }],
    transcript: [{ id: 's1', startMs: 10_500, endMs: 13_000, text: 'This pay button barely reads.' }], transcriptionStatus: 'ready',
  }
  expect(formatRecordingTime(62_100)).toBe('1:02')
  expect(buildRecordingAgentPayload(recording)).toContain('## CRRT capture · Acme checkout · 0:42')
  expect(buildRecordingAgentPayload(recording)).toContain('[0:10] keyframe_01.png  box')
  expect(buildRecordingAgentPayload(recording)).toContain('target: button.pay-cta')
  expect(buildRecordingAgentPayload(recording)).toContain('note: "too dark"')
  expect(buildRecordingAgentPayload({ ...recording, pageTitle: undefined })).toContain('CRRT capture · Checkout review')
  expect(buildRecordingAgentPayload({
    ...recording,
    marks: [
      { id: 'late', type: 'pin', atMs: 99_000, points: [] },
      { id: 'near', type: 'draw', atMs: 10_700, points: [] },
      { id: 'far', type: 'box', atMs: 8_500, points: [] },
    ],
  })).toContain('keyframe_01.png  draw')
  expect(nearestRecordingMark(recording.marks, 11_500)?.id).toBe('m1')
  expect(nearestRecordingMark(recording.marks, 20_000)).toBeNull()
  expect(recordingMarkOpacity(recording.marks[0], 10_999)).toBe(0)
  expect(recordingMarkOpacity(recording.marks[0], 11_000)).toBe(1)
  expect(recordingMarkOpacity(recording.marks[0], 13_750)).toBe(1)
  expect(recordingMarkOpacity(recording.marks[0], 13_875)).toBe(.5)
  expect(recordingMarkOpacity(recording.marks[0], 14_000)).toBe(0)
})

it('builds an honest mark-only agent payload when transcription is unavailable', () => {
  const recording: LocalRecording = {
    id: 'marks', title: 'Navigation review', source: 'tab', status: 'ready', durationMs: 8_000,
    createdAt: '2026-10-25T00:00:00Z', authorName: 'Tomás',
    marks: [{ id: 'm1', type: 'text', atMs: 2_000, points: [{ x: 10, y: 20 }], text: 'Tighten spacing', target: { selector: 'nav' } }],
    transcript: [], transcriptionStatus: 'failed', transcriptionError: 'Not found',
  }
  const payload = buildRecordingAgentPayload(recording)
  expect(payload).toContain('Transcript unavailable.')
  expect(payload).toContain('[0:02] keyframe_01.png  text')
  expect(payload).toContain('target: nav')
  expect(payload).toContain('note: "Tighten spacing"')
  expect(buildRecordingAgentPayload({ ...recording, marks: [], transcriptionStatus: 'processing' })).toContain('Transcript is still processing.')
  expect(buildRecordingAgentPayload({ ...recording, marks: [], transcriptionStatus: 'ready' })).toContain('No speech detected.')
  expect(buildRecordingAgentPayload({ ...recording, marks: [] })).toContain('No marks captured.')
})

it('retries a failed capture without requiring the launcher to be reopened', () => {
  const failed = recorderReducer(initialRecorderState, { type: 'recording.failed', message: 'Permission dismissed' })
  const retry = recorderReducer(failed, { type: 'countdown.started' })
  expect(retry).toMatchObject({ status: 'countdown', countdown: 3, error: null })
  expect(recorderReducer(retry, { type: 'recording.started', now: 100 })).toMatchObject({ status: 'recording', startedAt: 100 })
})

it('clears marks and pause timing when retrying an interrupted recording', () => {
  const failed = { ...initialRecorderState, source: 'window' as const, cameraEnabled: false, status: 'failed' as const, durationMs: 9000, pausedMs: 4000, pausedAt: 5000, marks: [{ id: 'old', type: 'box' as const, atMs: 500, points: [] }] }
  expect(recorderReducer(failed, { type: 'countdown.started' })).toMatchObject({ status: 'countdown', source: 'window', cameraEnabled: false, durationMs: 0, pausedMs: 0, pausedAt: null, marks: [] })
})
