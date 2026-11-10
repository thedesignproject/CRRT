import { describe, expect, it } from 'vitest'
import { appendRecordingStroke, captureRecordingTitle, normalizeRecordingTitle, MAX_RECORDING_MARK_BYTES, boundedRecordingPoints, MAX_RECORDING_MARKS, buildRecordingAgentPayload, formatRecordingTime, initialRecorderState, nearestRecordingMark, recordingMarkOpacity, recorderReducer, type LocalRecording, type RecordingStroke } from './recording'

it('bounds long strokes deterministically and enforces the mark cap with undo/clear recovery', () => {
  const points = Array.from({ length: 10000 }, (_, i) => ({ x: i / 100, y: 50 }))
  const bounded = boundedRecordingPoints(points)
  expect(bounded).toHaveLength(2048)
  expect(bounded[0]).toEqual(points[0]); expect(bounded[bounded.length - 1]).toEqual(points[points.length - 1])
  expect(boundedRecordingPoints(bounded)).toBe(bounded)
  const mark = { id: 'mark', type: 'draw' as const, atMs: 1, points: [{ x: 1, y: 1 }] }
  expect(recorderReducer({ ...initialRecorderState, status: 'recording' }, { type: 'mark.added', mark: { ...mark, points } }).marks[0].points).toHaveLength(2048)
  let state = { ...initialRecorderState, status: 'recording' as const }
  for (let i = 0; i < MAX_RECORDING_MARKS + 1; i++) state = recorderReducer(state, { type: 'mark.added', mark: { ...mark, id: String(i) } }) as typeof state
  expect(state.marks).toHaveLength(500)
  expect(state.marks[0].points).toHaveLength(1)
  expect(state.marks[state.marks.length - 1].id).toBe('499')
  state = recorderReducer(state, { type: 'mark.undone' }) as typeof state
  state = recorderReducer(state, { type: 'mark.added', mark }) as typeof state
  expect(state.marks).toHaveLength(500)
  expect(state.marks[state.marks.length - 1].id).toBe('mark')
  state = recorderReducer(state, { type: 'marks.cleared' }) as typeof state
  expect(state.marks).toHaveLength(0)
})
it('preserves the middle trajectory and endpoints while streaming a long stroke within a bounded buffer', () => {
  let stroke: RecordingStroke = { points: [], stride: 1, seen: 0 }
  for (let i = 0; i < 10000; i++) {
    stroke = appendRecordingStroke(stroke, { x: i, y: i >= 2000 && i <= 3000 ? 100 : 0 })
    expect(stroke.points.length).toBeLessThanOrEqual(2048)
    expect(stroke.points[stroke.points.length - 1].x).toBe(i)
  }
  expect(stroke.points[0].x).toBe(0)
  expect(stroke.points.some(p => p.x > 2100 && p.x < 2900 && p.y === 100)).toBe(true)
  expect(stroke.points.some(p => p.x > 4000 && p.x < 6000)).toBe(true)
})
it('keeps the annotation byte budget bounded and allows recovery with Undo or Clear', () => {
  const mark = { id: 'large', type: 'draw' as const, atMs: 1, points: Array.from({ length: 2048 }, (_, i) => ({ x: i / 21.3, y: i / 22.7 })) }
  let state = { ...initialRecorderState, status: 'recording' as const }
  for (let i = 0; i < 30; i++) state = recorderReducer(state, { type: 'mark.added', mark: { ...mark, id: String(i) } }) as typeof state
  expect(state.marks.length).toBeLessThan(30)
  expect(new TextEncoder().encode(JSON.stringify(state.marks)).length).toBeLessThanOrEqual(MAX_RECORDING_MARK_BYTES)
  expect(state.annotationLimitReached).toBe(true)
  state = recorderReducer(state, { type: 'mark.undone' }) as typeof state
  expect(state.annotationLimitReached).toBe(false)
  state = recorderReducer(state, { type: 'mark.added', mark }) as typeof state
  expect(state.annotationLimitReached).toBe(false)
  expect(recorderReducer({ ...state, annotationLimitReached: true }, { type: 'marks.cleared' }).annotationLimitReached).toBe(false)
})
it('limits generated titles while preserving the complete first note and handles empty imports', () => {
  const note = 'Important note '.repeat(100)
  expect(captureRecordingTitle([{ text: note } as any], 'Page')).toBe(note.slice(0, 240).trim())
  expect(captureRecordingTitle([], '  Page  ')).toBe('Page')
  expect(captureRecordingTitle([{ text: '  ' } as any], 'Page')).toBe('Page')
  expect(captureRecordingTitle([], undefined)).toBe('Untitled recording')
  expect(normalizeRecordingTitle('   ')).toBe('Untitled recording')
  expect(normalizeRecordingTitle('x'.repeat(239) + '🥕')).toBe('x'.repeat(239))
})
it('rejects oversized capture notes with feedback and accepts a complete 2,000-character replacement', () => {
  const mark = { id: 'note', type: 'text' as const, atMs: 1, points: [{ x: 50, y: 50 }], text: 'x'.repeat(2001) }
  const rejected = recorderReducer({ ...initialRecorderState, status: 'recording' }, { type: 'mark.added', mark })
  expect(rejected.marks).toEqual([])
  expect(rejected.annotationError).toContain('Shorten the note and try again')
  expect(mark.text).toHaveLength(2001)
  const accepted = recorderReducer(rejected, { type: 'mark.added', mark: { ...mark, text: 'x'.repeat(2000) } })
  expect(accepted.marks[0].text).toHaveLength(2000)
  expect(accepted.annotationError).toBeNull()
  expect(recorderReducer(rejected, { type: 'mark.undone' }).annotationError).toBeNull()
  expect(recorderReducer(rejected, { type: 'marks.cleared' }).annotationError).toBeNull()
})

describe('recorder state', () => {
  it('keeps explicit transcription consent through countdown/restart and locks it during capture', () => {
    const consented = recorderReducer(initialRecorderState, { type: 'transcription.toggled' })
    expect(consented.hostedTranscription).toBe(true)
    expect(recorderReducer({ ...consented, status: 'failed' }, { type: 'transcription.toggled' }).hostedTranscription).toBe(false)
    expect(recorderReducer({ ...consented, status: 'recording' }, { type: 'transcription.toggled' }).hostedTranscription).toBe(true)
    expect(recorderReducer(consented, { type: 'countdown.started' }).hostedTranscription).toBe(true)
    expect(recorderReducer(consented, { type: 'recording.restarted' }).hostedTranscription).toBe(true)
  })
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

it('exports bare marks and unmatched speech without inventing target or note context', () => {
  const recording: LocalRecording = {
    id: 'bare', title: 'Visual review', source: 'screen', status: 'ready', durationMs: 20000,
    createdAt: '2026-10-30T00:00:00Z', authorName: 'Tester', transcriptionStatus: 'ready',
    transcript: [], marks: [{ id: 'draw', type: 'draw', atMs: 15000, points: [{ x: 10, y: 20 }] }],
  }
  const marksOnly = buildRecordingAgentPayload(recording)
  expect(marksOnly).toContain('[0:15] keyframe_01.png  draw')
  expect(marksOnly).not.toContain('target:')
  expect(marksOnly).not.toContain('note:')
  const speech = buildRecordingAgentPayload({ ...recording,
    transcript: [{ id: 'speech', startMs: 0, endMs: 1000, text: 'Review this screen.' }],
  })
  expect(speech).toContain('[0:00] keyframe_01.png\n  "Review this screen."')
  expect(speech).toContain('[0:15] keyframe_02.png  draw')
  expect(speech).not.toContain('target:')
  expect(speech).not.toContain('note:')
})

it('clears marks and pause timing when retrying an interrupted recording', () => {
  const failed = { ...initialRecorderState, source: 'window' as const, cameraEnabled: false, status: 'failed' as const, durationMs: 9000, pausedMs: 4000, pausedAt: 5000, marks: [{ id: 'old', type: 'box' as const, atMs: 500, points: [] }] }
  expect(recorderReducer(failed, { type: 'countdown.started' })).toMatchObject({ status: 'countdown', source: 'window', cameraEnabled: false, durationMs: 0, pausedMs: 0, pausedAt: null, marks: [] })
})

it('exports every annotation alongside speech, including silence and multiple marks at one moment', () => {
  const recording: LocalRecording = {
    id: 'all-events', title: 'All events', source: 'tab', status: 'ready', durationMs: 20000,
    createdAt: '2026-10-30T00:00:00Z', authorName: 'Tester', transcriptionStatus: 'ready',
    transcript: [{ id: 'speech', startMs: 0, endMs: 2000, text: 'Check this button.' }],
    marks: [
      { id: 'silent', type: 'text', atMs: 15000, points: [{ x: 1, y: 1 }], text: 'Spacing during silence', target: { selector: '#silent' } },
      { id: 'nearest', type: 'box', atMs: 1000, points: [{ x: 2, y: 2 }], target: { selector: '#nearest' } },
      { id: 'other', type: 'text', atMs: 1100, points: [{ x: 3, y: 3 }], text: 'Second note', target: { selector: '#other' } },
      { id: 'plain', type: 'arrow', atMs: 19000, points: [{ x: 4, y: 4 }] },
    ],
  }
  const payload = buildRecordingAgentPayload(recording)
  for (const text of ['Check this button.', '#nearest', '#silent', '#other', 'Spacing during silence', 'Second note', '[0:19]']) expect(payload).toContain(text)
  expect(payload.indexOf('#other')).toBeLessThan(payload.indexOf('#silent'))
  expect(payload.match(/#nearest/g)).toHaveLength(1)
})
