import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { Film, MonitorUp, Pin, Plus, Sparkles } from 'lucide-react'
import { formatRecordingTime, type LocalRecording } from '../../lib/recording'
import { listLocalRecordings } from '../../lib/recording-store'
import { RecordingLibrary, type RecordingPage } from '../../../../shared/record/Library'
import { ownerRecordRequest } from '../../lib/recording-cloud'
import './style.css'

export function RecordingsApp() {
  const [recordings, setRecordings] = useState<LocalRecording[]>([])
  const load = useCallback((before?: string) => ownerRecordRequest<RecordingPage>(`recordings${before ? `?before=${encodeURIComponent(before)}` : ''}`), [])
  const [error, setError] = useState('')
  async function openRecorder() {
    setError('')
    try {
      const response = await browser.runtime.sendMessage({ type: 'record:open' })
      if (!response?.ok) throw new Error(response?.error || 'Could not open the recorder. Try again.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open the recorder. Try again.')
    }
  }
  useEffect(() => { listLocalRecordings().then(setRecordings).catch(() => {}) }, [])
  return <main>
    <aside>
      <div className="brand"><span>🥕</span><strong>CRRT</strong></div>
      <nav><a>Projects</a><a>Carrots</a><a className="active"><Film size={15} />Recordings <em>{recordings.length}</em></a><a>Brain</a></nav>
      <div className="aside-bottom"><a>Settings</a><div className="profile"><span>TO</span><p>Your recordings<small>Private library</small></p></div></div>
    </aside>
    <section className="library">
      <header><div><span className="eyebrow"><Sparkles size={12} /> CRRT Record</span><h1>Recordings</h1><p>Show it once. Your team watches it, your agent reads it.</p></div><button onClick={() => { void openRecorder() }}><Plus size={16} />New recording <kbd>⌥⇧R</kbd></button></header>
      {error && <p role="alert">{error}</p>}
      <RecordingLibrary load={load} href={id => `${import.meta.env.WXT_DASHBOARD_URL.replace(/\/$/, "")}/recording?id=${id}`} remove={id => ownerRecordRequest(`recordings/${id}`, undefined, 'DELETE')} />
      {recordings.length > 0 && <><h2>Your local captures</h2><div className="grid">{recordings.map((recording) => <button className="card" key={recording.id} onClick={() => location.assign(new URL(`/record.html?recording=${recording.id}`, browser.runtime.getURL('/private.html')).toString())}><div className="thumbnail actual">{recording.thumbnailDataUrl ? <img src={recording.thumbnailDataUrl} alt="" /> : <MonitorUp size={30} />}<span className="avatar">TO</span><time>{formatRecordingTime(recording.durationMs)}</time>{recording.marks.length > 0 && <i className="mark" />}</div><div className="card-copy"><strong>{recording.title}</strong><p>{recording.authorName} · just now</p><div><span className={`status ${recording.transcriptionStatus === 'failed' ? 'transcript-failed' : 'ready'}`}>{recording.transcriptionStatus === 'processing' ? 'Transcribing' : recording.transcriptionStatus === 'failed' ? 'Transcript failed' : 'Ready'}</span><small><Pin size={11} />{recording.marks.length} marks</small></div></div></button>)}</div></>}
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<RecordingsApp />)
