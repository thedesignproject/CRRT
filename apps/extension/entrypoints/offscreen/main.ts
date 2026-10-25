import { browser } from 'wxt/browser'
import { startRecordingCapture, type RecordingCapture } from '../../lib/recording-capture'
import { initialRecorderState, recorderReducer, type LocalRecording, type RecorderState } from '../../lib/recording'
import { saveLocalRecording } from '../../lib/recording-store'
import { sessionSnapshot, type RecordingSessionSnapshot, type RecordingSurfaceCommand } from '../../lib/recording-session'

type Active = {
  sessionId: string
  pageUrl?: string
  pageTitle?: string
  state: RecorderState
  capture: RecordingCapture
  timer?: number
}

let active: Active | null = null

function title(state: RecorderState, pageTitle?: string) {
  return state.marks[0]?.text || pageTitle || 'Untitled recording'
}

function transcript(state: RecorderState, durationMs: number) {
  return [
    { id: crypto.randomUUID(), startMs: 1_200, endMs: Math.min(4_600, durationMs), text: 'Okay, this is the flow we are reviewing today.' },
    ...state.marks.map((mark) => ({
      id: crypto.randomUUID(), startMs: Math.max(0, mark.atMs - 900), endMs: Math.min(durationMs, mark.atMs + 2_400),
      text: mark.text || `Look here. This ${mark.target?.tagName || 'area'} should be clearer before we ship.`,
    })),
  ]
}

async function emit(sessionId: string, snapshot: RecordingSessionSnapshot) {
  await browser.runtime.sendMessage({ type: 'record:offscreen-state', target: 'background', sessionId, snapshot })
}

function clearTimer(session: Active) {
  if (session.timer !== undefined) window.clearInterval(session.timer)
  session.timer = undefined
}

async function begin(message: any) {
  if (active) await discard(active)
  const initial = { ...initialRecorderState, ...message.snapshot } as RecorderState
  const capture = await startRecordingCapture({
    source: initial.source,
    cameraEnabled: initial.cameraEnabled,
    microphoneEnabled: initial.microphoneEnabled,
    tabStreamId: message.tabStreamId,
  })
  capture.pause()
  let state = recorderReducer(initial, { type: 'countdown.started' })
  active = { sessionId: message.sessionId, pageUrl: message.pageUrl, pageTitle: message.pageTitle, state, capture }
  await emit(active.sessionId, sessionSnapshot(state))
  active.timer = window.setInterval(() => {
    if (!active || active.sessionId !== message.sessionId) return
    active.state = recorderReducer(active.state, { type: 'countdown.ticked' })
    if (active.state.countdown === 0) {
      clearTimer(active)
      capture.resume()
      active.state = recorderReducer(active.state, { type: 'recording.started', now: performance.now() })
      active.timer = window.setInterval(() => {
        if (!active || active.sessionId !== message.sessionId) return
        active.state = recorderReducer(active.state, { type: 'recording.ticked', now: performance.now() })
        void emit(active.sessionId, sessionSnapshot(active.state))
      }, 200)
    }
    void emit(message.sessionId, sessionSnapshot(active.state))
  }, 1_000)
}

async function discard(session: Active) {
  clearTimer(session)
  await session.capture.stop().catch(() => undefined)
  if (active === session) active = null
}

async function finish(session: Active) {
  clearTimer(session)
  session.state = recorderReducer(session.state, { type: 'recording.finished', now: performance.now() })
  await emit(session.sessionId, sessionSnapshot(session.state))
  const blobs = await session.capture.stop()
  const durationMs = Math.max(session.state.durationMs, 1_000)
  const recording: LocalRecording = {
    id: crypto.randomUUID(),
    title: title(session.state, session.pageTitle),
    source: session.state.source,
    status: 'ready',
    pageUrl: session.pageUrl,
    pageTitle: session.pageTitle,
    durationMs,
    createdAt: new Date().toISOString(),
    authorName: 'Tomás',
    marks: session.state.marks,
    transcript: transcript(session.state, durationMs),
    screenBlob: blobs.screenBlob,
    cameraBlob: blobs.cameraBlob,
  }
  await saveLocalRecording(recording)
  active = null
  await browser.runtime.sendMessage({ type: 'record:offscreen-finished', target: 'background', sessionId: session.sessionId, recordingId: recording.id })
}

async function applyCommand(command: RecordingSurfaceCommand) {
  const session = active
  if (!session) return
  if (command.kind === 'cancel') { await discard(session); return }
  if (command.kind === 'finish') { await finish(session); return }
  if (command.kind === 'restart') {
    const restart = { ...session, state: recorderReducer(session.state, { type: 'recording.restarted' }) }
    await discard(session)
    await browser.runtime.sendMessage({ type: 'record:offscreen-restart', target: 'background', sessionId: restart.sessionId })
    return
  }
  if (command.kind === 'pause.toggle') {
    if (session.state.status === 'recording') { session.capture.pause(); session.state = recorderReducer(session.state, { type: 'recording.paused', now: performance.now() }) }
    else if (session.state.status === 'paused') { session.capture.resume(); session.state = recorderReducer(session.state, { type: 'recording.resumed', now: performance.now() }) }
  } else if (command.kind === 'tool.changed') session.state = recorderReducer(session.state, { type: 'tool.changed', tool: command.tool })
  else if (command.kind === 'mark.added') session.state = recorderReducer(session.state, { type: 'mark.added', mark: command.mark })
  else if (command.kind === 'mark.undone') session.state = recorderReducer(session.state, { type: 'mark.undone' })
  else if (command.kind === 'marks.cleared') session.state = recorderReducer(session.state, { type: 'marks.cleared' })
  await emit(session.sessionId, sessionSnapshot(session.state))
}

browser.runtime.onMessage.addListener((message: any) => {
  if (message?.target !== 'offscreen') return
  if (message.type === 'record:offscreen-start') void begin(message).catch((error) => browser.runtime.sendMessage({
    type: 'record:offscreen-error', target: 'background', sessionId: message.sessionId,
    error: error instanceof Error ? error.message : 'Could not start recording.',
  }))
  if (message.type === 'record:offscreen-command') void applyCommand(message.command)
})
