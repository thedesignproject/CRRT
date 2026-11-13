import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, FileText, MapPin, Mic, Pause, Play, X } from 'lucide-react'
import { Button } from '../../../src/design-system'
import { FeedbackWidget } from '../../../src/components/FeedbackWidget'
import type { Comment, PersonalComments, PrototypeComposerContext } from '../../../src/components/FeedbackWidget/types'
import { TextRangeQuote } from '../../../src/components/FeedbackWidget/quote'
import { ensureWidgetFonts } from '../../../src/components/FeedbackWidget/fonts'
import { getInitials, avatarColor } from '../../../src/components/FeedbackWidget/format'
import { recordingError, startRecording, type VoiceRecording } from './recording'
import { startTranscription, type Transcript } from './transcription'
import './voice-prototype.css'

type Phase = 'idle' | 'requesting' | 'recording' | 'finishing' | 'draft' | 'sending'
export type Clip = { url: string; seconds: number; levels: number[]; transcript: Transcript }
const reviewer = 'Demo Reviewer'
const quietLevels = Array<number>(24).fill(0)

export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

function IconButton({ label, active = false, disabled = false, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return <button type="button" className={`vp-icon${active ? ' vp-active' : ''}`} aria-label={label} title={label}
    disabled={disabled} onClick={onClick}>{children}</button>
}

function Waveform({ levels, active = false }: { levels: number[]; active?: boolean }) {
  return <div className={`vp-wave${active ? ' vp-wave-active' : ''}`} aria-hidden="true">
    {levels.map((level, index) => <span key={index} style={{ height: `${4 + level * 24}px` }} />)}
  </div>
}

export function VoicePlayer({ clip, onRemove, transcript = false }: { clip: Clip; onRemove?: () => void; transcript?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const transcriptId = useId()
  useEffect(() => {
    const element = audio.current!
    return () => element.pause()
  }, [])
  async function toggle() {
    setError('')
    if (playing) audio.current!.pause()
    else {
      try { await audio.current!.play() }
      catch { setError('Playback could not start. Try again.'); return }
    }
  }
  return <div className="vp-audio">
    <div className="vp-row vp-between"><span>Voice note</span><span className="vp-time">{formatDuration(playing ? elapsed : clip.seconds)}</span></div>
    <div className="vp-row">
      <IconButton label={playing ? 'Pause voice note' : 'Play voice note'} active onClick={() => void toggle()}>{playing ? <Pause /> : <Play />}</IconButton>
      <Waveform levels={clip.levels} />
      {onRemove && <IconButton label="Remove voice note" onClick={onRemove}><X /></IconButton>}
    </div>
    <audio ref={audio} src={clip.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setElapsed(0) }} onTimeUpdate={() => setElapsed(audio.current!.currentTime)}
      onError={() => { setPlaying(false); setError('This recording could not be played. Record another take.') }} />
    {error && <p role="alert" className="vp-error">{error}</p>}
    {transcript && <div className="vp-transcript">
      <button type="button" aria-expanded={expanded} aria-controls={transcriptId} onClick={() => setExpanded(!expanded)}>
        <FileText />{expanded ? 'Hide transcript' : clip.transcript.status === 'unavailable' ? 'Transcript unavailable' : 'Show transcript'}{expanded ? <ChevronUp /> : <ChevronDown />}
      </button>
      {expanded && <div id={transcriptId}><p className="vp-transcript-label">{clip.transcript.status === 'ready' ? 'Auto-generated transcript' : clip.transcript.status === 'partial' ? 'Partial transcript' : 'Transcription unavailable'}</p><p>{clip.transcript.text}</p>{clip.transcript.reason && <p>{clip.transcript.reason}</p>}</div>}
    </div>}
  </div>
}

/** Opt-in, local-only prototype. Intentionally does not call the comments API. */
export function VoiceComposer({ context, onSubmit }: {
  context: PrototypeComposerContext
  onSubmit: (note: string, clip: Clip | null) => Promise<boolean>
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [note, setNote] = useState('')
  const [clip, setClip] = useState<Clip | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState(quietLevels)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const session = useRef<VoiceRecording | null>(null)
  const abort = useRef<AbortController | null>(null)
  const peakLevels = useRef(quietLevels)
  const mic = useRef<HTMLButtonElement>(null)
  const speech = useRef<ReturnType<typeof startTranscription> | null>(null)
  const transferred = useRef(false)
  const submitting = useRef(false)
  const latestClip = useRef<Clip | null>(null)
  latestClip.current = clip
  const busy = phase === 'requesting' || phase === 'recording' || phase === 'finishing' || phase === 'sending'

  useEffect(() => { ensureWidgetFonts(); return () => abort.current?.abort() }, [])
  useEffect(() => () => { if (latestClip.current && !transferred.current) URL.revokeObjectURL(latestClip.current.url) }, [])

  function discardRecording() {
    abort.current?.abort()
    session.current = null
    setPhase('idle')
    setSeconds(0)
    setLevels(quietLevels)
    mic.current!.focus()
  }
  async function record() {
    const controller = new AbortController()
    abort.current = controller
    setError('')
    setSeconds(0)
    peakLevels.current = quietLevels
    setPhase('requesting')
    try {
      const recording = await startRecording(controller.signal, sample => {
        setSeconds(sample.seconds)
        setLevels(sample.levels)
        peakLevels.current = sample.levels.map((value, i) => Math.max(value, peakLevels.current[i]))
      }, () => { setError('The microphone disconnected. Your typed note is safe; try recording again.'); discardRecording() })
      if (controller.signal.aborted) return
      session.current = recording
      speech.current = startTranscription(controller.signal)
      setPhase('recording')
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(recordingError(failure))
      setPhase('idle')
      mic.current!.focus()
    }
  }
  async function finish() {
    const controller = abort.current!
    setPhase('finishing')
    try {
      const [blob, transcript] = await Promise.all([session.current!.finish(), speech.current!.finish()])
      if (controller.signal.aborted) return
      setClip({ url: URL.createObjectURL(blob), seconds, levels: peakLevels.current, transcript })
      setPhase('draft')
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(recordingError(failure))
      setPhase('idle')
    }
  }
  // Bound memory for a local prototype. Checking early uses the same finish path.
  useEffect(() => { if (phase === 'recording' && seconds >= 120) void finish() }, [phase, seconds])

  async function send() {
    if (submitting.current || busy || context.screenshotStatus === 'capturing' || (!note.trim() && !clip)) return
    submitting.current = true
    setPhase('sending')
    transferred.current = true
    const saved = await onSubmit(note, clip)
    if (!saved) {
      transferred.current = false
      submitting.current = false
      setPhase(clip ? 'draft' : 'idle')
      setError('Could not save your comment. Your draft is still here; try again.')
    }
  }
  function cancel() {
    if (note.trim() || clip || busy) setConfirmDiscard(true)
    else context.cancel()
  }
  function removeClip() {
    URL.revokeObjectURL(clip!.url)
    setClip(null)
    setPhase('idle')
  }
  const avatar = <span className="vp-avatar" style={{ background: avatarColor(reviewer) }} title={`Signed in as ${reviewer}`}>{getInitials(reviewer)}</span>
  return <section aria-label="Leave feedback" className="vp-root vp-composer" onKeyDown={event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); void send() }
  }}>
        <div className="vp-header"><span className="vp-chip vp-now">Just now</span><span className="vp-chip vp-path"><MapPin />{new URL(context.target.url).pathname}</span></div>
        <div className="vp-input"><textarea autoFocus aria-label="Comment" placeholder={busy || clip ? 'Add a note (optional)…' : 'Leave your comment…'}
          rows={3} value={note} onChange={event => setNote(event.target.value)} /></div>
        {context.target.anchor && <TextRangeQuote text={context.target.anchor.selectedText} style={{ margin: '0 14px 8px' }} />}
        {(phase === 'recording' || phase === 'finishing') && <div className="vp-audio vp-recording">
          <div className="vp-row vp-between"><span className="vp-record-label"><i />{phase === 'finishing' ? 'Preparing voice note…' : 'Recording'}</span><span className="vp-time">{formatDuration(seconds)}</span></div>
          <div className="vp-row"><IconButton label="Discard recording" onClick={discardRecording}><X /></IconButton><Waveform levels={levels} active />
            <IconButton label="Attach voice note" active disabled={phase === 'finishing'} onClick={() => void finish()}><Check /></IconButton></div>
        </div>}
        {phase === 'requesting' && <p role="status" className="vp-status">Allow microphone access to start recording… <button onClick={discardRecording}>Cancel request</button></p>}
        {clip && <div className="vp-draft"><VoicePlayer clip={clip} onRemove={removeClip} /></div>}
        {error && <p role="alert" className="vp-error vp-status">{error}</p>}
        {context.screenshotStatus !== 'idle' && <div className="vp-attachment">{context.imagePreviewUrl && <img src={context.imagePreviewUrl} alt="Selected element screenshot" />}<span>{context.screenshotStatus === 'capturing' ? 'Capturing screenshot…' : context.screenshotStatus === 'failed' ? 'Screenshot unavailable' : 'Screenshot'}</span><button type="button" aria-label="Remove screenshot" onClick={context.removeScreenshot}><X /></button></div>}
        <div className="vp-footer"><div className="vp-identity">{avatar}<button ref={mic} type="button" className={`vp-icon${phase === 'recording' ? ' vp-active' : ''}`}
          aria-label={phase === 'recording' ? 'Microphone is recording' : 'Record voice note'} aria-pressed={phase === 'recording'}
          disabled={busy || Boolean(clip)} onClick={() => void record()}><Mic /></button></div>
          <div className="vp-actions"><Button tone="secondary" className="vp-cancel" onClick={cancel}>Cancel</Button>
            <Button className="vp-send" disabled={busy || context.screenshotStatus === 'capturing' || (!note.trim() && !clip)} onClick={() => void send()}>{phase === 'sending' ? 'Sending…' : 'Send'}<ArrowRight size={14} /></Button></div>
        </div>
        {confirmDiscard && <div role="alertdialog" aria-label="Discard this comment?" className="vp-discard"><p>Discard this comment and its recording?</p><div className="vp-actions"><Button tone="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button><Button onClick={context.cancel}>Discard</Button></div></div>}
      <span className="vp-sr" role="status">{phase === 'recording' ? 'Recording started. Check to attach your voice note, then Send to post.' : phase === 'draft' ? 'Voice note attached. Review it or send your comment.' : ''}</span>
  </section>
}

/** Uses the production selection, anchored composer, screenshot capture, pins and review list. */
export function VoiceCommentPrototype() {
  const comments = useRef<Comment[]>([])
  const clips = useRef(new Map<string, Clip>())
  const pendingClip = useRef<Clip | null>(null)
  useEffect(() => () => { clips.current.forEach(clip => URL.revokeObjectURL(clip.url)) }, [])
  const personalComments = useMemo<PersonalComments>(() => ({
    label: 'Prototype comments',
    list: async () => comments.current,
    create: async payload => {
      const comment: Comment = {
        id: crypto.randomUUID(), projectId: 'voice-prototype', pageUrl: String(payload.pageUrl),
        selector: String(payload.selector), x: Number(payload.x), y: Number(payload.y),
        targetType: payload.targetType as Comment['targetType'], anchor: payload.anchor as Comment['anchor'],
        body: String(payload.body), authorName: reviewer, createdAt: new Date().toISOString(), reviewStatus: 'open',
        imageUrl: payload.imageBase64 ? `data:${payload.imageMimeType};base64,${payload.imageBase64}` : null,
      }
      if (pendingClip.current) clips.current.set(comment.id, pendingClip.current)
      comments.current = [comment, ...comments.current]
      return comment
    },
    update: async (id, body) => { comments.current = comments.current.map(comment => comment.id === id ? { ...comment, body } : comment) },
    remove: async id => {
      const clip = clips.current.get(id)
      if (clip) URL.revokeObjectURL(clip.url)
      clips.current.delete(id)
      comments.current = comments.current.filter(comment => comment.id !== id)
    },
  }), [])
  return <>
    <FeedbackWidget projectId="voice-prototype" personalComments={personalComments} viewerEmail={reviewer} prototype={{
      composer: context => <VoiceComposer context={context} onSubmit={async (note, clip) => {
        pendingClip.current = clip
        return context.submit(note.trim() || 'Voice note')
      }} />,
      commentBody: comment => {
        const clip = clips.current.get(comment.id)
        return clip ? <div className="vp-root" onClick={event => event.stopPropagation()}>
          {comment.body !== 'Voice note' && <p className="vp-note">{comment.body}</p>}
          <VoicePlayer clip={clip} transcript />
        </div> : comment.body
      },
    }} />
    <aside data-fw data-fw-crrt className="vp-root vp-prototype-label" aria-label="Prototype information">Voice prototype <span>Comments stay in this tab · browser transcribes voice</span></aside>
  </>
}
