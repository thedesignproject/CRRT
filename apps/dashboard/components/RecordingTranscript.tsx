import { useState } from 'react'
import { FileText, Search, X } from 'lucide-react'
import type { RecordingPlayback } from '../../../shared/record/client'
import { RecordingRecovery, type RecoveryStage } from '../../../shared/record/Recovery'

export function recordingTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function RecordingTranscript({ playback, atMs, seek, retry }: { playback: RecordingPlayback; atMs: number; seek: (ms: number) => void; retry?: (stage: RecoveryStage) => Promise<void> }) {
  const [query, setQuery] = useState('')
  const segments = playback.transcript.filter(segment => segment.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const stage = playback.stages.find(stage => stage.stage === 'transcription')
  const pending = stage ? stage.state === 'pending' || stage.state === 'running' : playback.recording.state !== 'ready' && playback.recording.state !== 'failed'
  return <aside className="recording-transcript" aria-label="Transcript">
    <header><div><FileText size={16} aria-hidden="true" /><h2>Transcript</h2></div><span>{playback.transcript.length > 0 ? `${playback.transcript.length} segments` : 'Audio context'}</span></header>
    {playback.transcript.length > 0 ? <>
      <div className="recording-transcript-search"><Search size={15} aria-hidden="true" /><input aria-label="Search transcript" type="search" placeholder="Search transcript…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear transcript search" onClick={() => setQuery('')}><X size={14} aria-hidden="true" /></button>}</div>
      <div className="recording-transcript-segments">
        {segments.map(segment => <button type="button" key={segment.id} className="recording-transcript-segment" aria-current={atMs >= segment.start_ms && atMs < segment.end_ms ? 'true' : undefined} onClick={() => seek(segment.start_ms)}><time>{recordingTime(segment.start_ms)}</time><span>{segment.text}</span></button>)}
        {segments.length === 0 && <p className="recording-transcript-no-results">No matching transcript. Try another word.</p>}
      </div>
      <footer>Select a passage to jump to that moment.</footer>
    </> : <div className="recording-transcript-empty"><FileText size={24} strokeWidth={1.5} aria-hidden="true" /><h3>{stage?.state === 'failed' ? 'Transcription interrupted' : pending ? 'Transcript is on its way' : 'No transcript available'}</h3><p>{stage?.state === 'failed' ? 'The video remains available once video preparation finishes.' : pending ? 'If transcription was enabled, it will appear here when processing finishes.' : 'This recording has no transcript. You can still watch the video and explore its key moments.'}</p></div>}
    <RecordingRecovery stages={playback.stages.filter(job => job.stage === 'transcription')} retry={retry} />
  </aside>
}
