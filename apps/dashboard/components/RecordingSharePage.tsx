import { useEffect, useRef, useState } from 'react'
import { recordRequest, type RecordingPlayback, type RecordingSummary } from '../../../shared/record/client'
import { ArrowLeft, Camera, CameraOff, Maximize, Minimize, Play, Pause, Volume2, VolumeX, Monitor, LockKeyhole, Film, Loader2 } from 'lucide-react'
import { asset, route } from '../lib/routes'
import { RecordingTitle } from './RecordingTitle'
import { RecordingMarks } from './RecordingMarks'
import { RecordingShareButton } from './RecordingShareButton'
import { RecordingTranscript, recordingTime } from './RecordingTranscript'
import { RecordingVideoCanvas } from './RecordingVideoCanvas'
import './recording-detail.css'

export function RecordingSharePage({ apiBase, ownerToken }: { apiBase: string; ownerToken?: string }) {
  const token = window.location.hash.slice(1)
  const ownerId = new URLSearchParams(window.location.search).get('id')
  const [playback, setPlayback] = useState<RecordingPlayback>(), [error, setError] = useState('')
  const [cameraVisible, setCameraVisible] = useState(true)
  const [playbackMs, setPlaybackMs] = useState(0)
  const [fullscreen, setFullscreen] = useState(false), [fullscreenError, setFullscreenError] = useState('')
  const [videoAspect, setVideoAspect] = useState(16 / 9)
  const [playing, setPlaying] = useState(false), [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1), [mediaError, setMediaError] = useState('')
  const composition = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLVideoElement>(null), camera = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === composition.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  async function toggleFullscreen() {
    setFullscreenError('')
    try {
      if (document.fullscreenElement === composition.current) await document.exitFullscreen()
      else await composition.current!.requestFullscreen()
    } catch { setFullscreenError('Fullscreen is unavailable in this browser. You can continue watching here.') }
  }
  useEffect(() => {
    document.title = 'CRRT Record'
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.append(meta)
    let disposed = false
    async function refresh() {
      try {
        const result = await recordRequest<RecordingPlayback>(apiBase, ownerToken ? `recordings/${encodeURIComponent(ownerId!)}/playback` : `recording-shares/${encodeURIComponent(token)}`, ownerToken || null)
        if (!disposed) { setPlayback(result); setError('') }
      } catch (error) { if (!disposed) { setPlayback(undefined); setError((error as Error).message) } }
    }
    void refresh()
    // Renew signed playback access before its five-minute expiry, including when ready.
    const timer = window.setInterval(() => { void refresh() }, 30_000)
    return () => { disposed = true; clearInterval(timer); meta.remove() }
  }, [apiBase, token, ownerToken, ownerId])
  const screen = playback?.artifacts.find(a => a.kind === 'screen')
  const face = playback?.recording.source === 'tab' ? undefined : playback?.artifacts.find(a => a.kind === 'camera')
  const accessAt = useRef(0)
  useEffect(() => {
    if (!screen || !player.current) return
    if (player.current.getAttribute('src') && Date.now() - accessAt.current < 240_000) return
    const video = player.current
    const at = video.currentTime, playing = !video.paused, rate = video.playbackRate
    video.src = screen.url
    accessAt.current = Date.now()
    video.onloadedmetadata = () => { video.currentTime = at; video.playbackRate = rate; if (playing) void video.play() }
  }, [screen])
  useEffect(() => {
    const video = camera.current
    if (!video || !face) return
    video.src = face.url
    video.onloadedmetadata = () => { syncFace(); if (player.current) { video.playbackRate = player.current.playbackRate; if (!player.current.paused) void video.play() } }
    return () => video.pause()
  }, [face?.url, cameraVisible])
  function syncFace() {
    if (player.current) setPlaybackMs(player.current.currentTime * 1000)
    if (camera.current && player.current && Math.abs(camera.current.currentTime - player.current.currentTime + face!.offsetMs / 1000) > .18) camera.current.currentTime = Math.max(0, player.current.currentTime - face!.offsetMs / 1000)
  }
  function seek(ms: number) {
    if (player.current) { player.current.currentTime = ms / 1000; syncFace() }
  }
  async function togglePlay() {
    const video = player.current!
    setMediaError('')
    if (!video.paused) video.pause()
    else try { await video.play() } catch { setMediaError('Playback could not start. Press play to try again.') }
  }
  function changeVolume(value: number) {
    setVolume(value); player.current!.volume = value
  }
  async function rename(title: string) {
    const result = await recordRequest<{ recording: RecordingSummary }>(apiBase, `recordings/${encodeURIComponent(ownerId!)}`, ownerToken!, { title }, 'PATCH')
    setPlayback(current => current ? { ...current, recording: { ...current.recording, title: result.recording.title } } : current)
  }
  const durationMs = playback?.recording.durationMs || 0
  const duration = Math.floor(durationMs / 1000)
  const Container = ownerToken ? 'section' : 'main'
  return <Container className="recording-detail" data-owner={Boolean(ownerToken)}>
    {ownerToken && <div className="flex flex-wrap items-center justify-between gap-3"><a href={`${route('/')}?view=recordings`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />Back to recordings</a>{playback && <RecordingShareButton key={ownerId} id={ownerId!} title={playback.recording.title} apiBase={apiBase} accessToken={ownerToken} />}</div>}
    {!ownerToken && <a href={route('/')} className="recording-public-brand"><img src={asset('crrt-isologo.png')} alt="" />CRRT<span>Record</span></a>}
    <div className="recording-detail-heading"><RecordingTitle key={playback ? 'loaded' : 'loading'} title={playback?.recording.title || 'CRRT Record'} rename={ownerToken && playback ? rename : undefined} /></div>
    {error && <p role="alert" className="recording-detail-notice">{error}</p>}
    {!playback && !error && <div className="recording-detail-loading"><Loader2 size={20} aria-hidden="true" /><p>Loading recording…</p></div>}
    {playback && <>
      <div className="recording-detail-meta">
        {playback.recording.durationMs != null && <span>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</span>}
        <span><Monitor size={14} aria-hidden="true" />{{ tab: 'Browser tab', window: 'Window', screen: 'Entire screen' }[playback.recording.source]}</span>
        <span><Film size={14} aria-hidden="true" />{playback.events.length} {playback.events.length === 1 ? 'moment' : 'moments'}</span>
        {ownerToken && <span><LockKeyhole size={14} aria-hidden="true" />Your recording</span>}
        {playback.recording.state !== 'ready' && <span className="recording-status" data-state={playback.recording.state}>{{ recording: 'Recording in progress', uploading: 'Uploading video…', processing: 'Processing recording…', failed: 'Processing failed' }[playback.recording.state]}</span>}
      </div>
      {playback.recording.failure && <p className="recording-detail-notice">Processing failed. The owner can retry processing.</p>}
      <div className="recording-detail-grid"><div className="recording-detail-main">
      {screen ? <div ref={composition} className="recording-composed-player recording-player">
        <div className="recording-player-stage" style={{ maxWidth: fullscreen ? `calc((100dvh - 8rem) * ${videoAspect})` : `calc(65dvh * ${videoAspect})` }}>
        <video ref={player} playsInline hidden className="recording-decoder" aria-label="Recording video" onLoadedMetadata={event => { const video = event.currentTarget; if (video.videoWidth && video.videoHeight) setVideoAspect(video.videoWidth / video.videoHeight) }} onTimeUpdate={syncFace} onSeeked={syncFace} onPlay={() => { setPlaying(true); void camera.current?.play() }} onPause={() => { setPlaying(false); camera.current?.pause() }} onEnded={() => setPlaying(false)} onError={() => setMediaError('The video could not load. Check your connection and reload the page.')} />
        <RecordingVideoCanvas source={player} crop={false} label="Recording picture" className="recording-primary-video" />
        {playback.recording.source !== 'tab' && <RecordingMarks events={playback.events} atMs={playbackMs} />}
        {face && cameraVisible && <div className="recording-camera-clip"><video ref={camera} muted playsInline aria-label="Camera" hidden /><RecordingVideoCanvas source={camera} /></div>}
        </div>
        <div className="recording-player-controls" role="group" aria-label="Playback controls">
          <input type="range" aria-label="Seek recording" min={0} max={durationMs} step={100} value={Math.min(playbackMs, durationMs)} onChange={event => seek(Number(event.target.value))} className="recording-player-seek" />
          <div className="recording-player-toolbar">
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => { void togglePlay() }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <span className="recording-player-time">{recordingTime(playbackMs)} <span>/ {recordingTime(duration * 1000)}</span></span>
          <div className="recording-player-spacer" />
          <button type="button" aria-label={volume === 0 ? 'Unmute' : 'Mute'} title={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => changeVolume(volume === 0 ? 1 : 0)}>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={volume} onChange={event => changeVolume(Number(event.target.value))} className="recording-player-volume" />
          <select aria-label="Playback speed" value={speed} onChange={event => { const value = Number(event.target.value); setSpeed(value); player.current!.playbackRate = value; if (camera.current) camera.current.playbackRate = value }}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select>
          {face && <button type="button" aria-pressed={cameraVisible} aria-label={cameraVisible ? 'Hide camera' : 'Show camera'} title={cameraVisible ? 'Hide camera' : 'Show camera'} onClick={() => setCameraVisible(visible => !visible)}>{cameraVisible ? <CameraOff size={18} /> : <Camera size={18} />}</button>}
          <button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => { void toggleFullscreen() }}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
          </div>
        </div>
        {fullscreenError && <p role="alert" className="recording-player-error">{fullscreenError}</p>}
        {mediaError && <p role="alert" className="recording-player-error">{mediaError}</p>}
      </div> : <div className="recording-playback-pending"><Film size={32} strokeWidth={1.5} aria-hidden="true" /><h2>Your recording is being prepared</h2><p>Playback will appear when uploading and media processing finish.</p></div>}
      <section aria-label="Timeline marks" className="recording-moments"><div className="recording-section-heading"><h2>Key moments</h2><span>{playback.events.length}</span></div><div className="recording-moment-list">{playback.events.map(event => <button type="button" key={event.id} onClick={() => seek(event.atMs)}><time>{recordingTime(event.atMs)}</time><span>{event.mark?.type || event.kind}</span></button>)}{playback.events.length === 0 && <p>No marks were added to this recording.</p>}</div></section>
      <section aria-label="Keyframes" className="recording-keyframes">{playback.keyframes.map(frame => {
        const image = playback.artifacts.find(a => a.id === frame.artifact_id)
        return image && <button type="button" key={frame.id} onClick={() => seek(frame.at_ms)}><img src={image.url} alt={`Keyframe at ${Math.floor(frame.at_ms / 1000)} seconds`} referrerPolicy="no-referrer" /><time>{recordingTime(frame.at_ms)}</time></button>
      })}</section>
      </div><RecordingTranscript playback={playback} atMs={playbackMs} seek={seek} /></div>
    </>}
  </Container>
}
