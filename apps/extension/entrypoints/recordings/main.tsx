import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { Clock3, Film, MonitorUp, Pin, Plus, Sparkles } from 'lucide-react'
import { formatRecordingTime, type LocalRecording } from '../../lib/recording'
import { listLocalRecordings } from '../../lib/recording-store'
import './style.css'

const demoCards = [
  { id: 'fixture-1', title: 'Checkout: pay button barely readable', author: 'Sofia · client', duration: '0:42', marks: '2 drawings · 1 pin · 1 note', tone: 'cream', status: 'Sent to Claude Code' },
  { id: 'fixture-2', title: 'Onboarding step 3, tightening the copy', author: 'Lu · PM', duration: '6:18', marks: '9 marks · 4 zooms', tone: 'blue', status: 'Agent working' },
  { id: 'fixture-3', title: 'Nav spacing on mobile', author: 'Tomás · design', duration: '0:28', marks: '1 mark · 1 box', tone: 'stone', status: 'Fixed' },
  { id: 'fixture-4', title: 'Pricing page review before Friday', author: 'Marcos · client', duration: '2:10', marks: '5 marks', tone: 'orange', status: 'Open' },
  { id: 'fixture-5', title: 'Empty states pass with the agent', author: 'Tomás · design', duration: '12:40', marks: '14 marks · 3 zooms', tone: 'green', status: 'Live session' },
  { id: 'fixture-6', title: 'Dashboard chart colors', author: 'Dani · design', duration: '0:37', marks: '2 boxes · 1 note', tone: 'dark', status: 'Sent to Claude Code' },
]

function openRecorder() { void browser.runtime.sendMessage({ type: 'record:open' }) }

export function RecordingsApp() {
  const [recordings, setRecordings] = useState<LocalRecording[]>([])
  const [filter, setFilter] = useState('All')
  useEffect(() => { listLocalRecordings().then(setRecordings).catch(() => {}) }, [])
  const showLocal = filter === 'All' || filter === 'Mine'
  const visibleDemoCards = demoCards.filter((card) => {
    if (filter === 'Mine') return card.author.startsWith('Tomás')
    if (filter === 'From clients') return card.author.includes('client')
    if (filter === 'Live sessions') return card.status === 'Live session'
    return true
  })
  return <main>
    <aside>
      <div className="brand"><span>🥕</span><strong>CRRT</strong></div>
      <nav><a>Projects</a><a>Carrots</a><a className="active"><Film size={15} />Recordings <em>{recordings.length || 6}</em></a><a>Brain</a></nav>
      <div className="aside-bottom"><a>Settings</a><div className="profile"><span>TO</span><p>Tomás<small>Local demo</small></p></div></div>
    </aside>
    <section className="library">
      <header><div><span className="eyebrow"><Sparkles size={12} /> CRRT Record</span><h1>Recordings</h1><p>Show it once. Your team watches it, your agent reads it.</p></div><button onClick={openRecorder}><Plus size={16} />New recording <kbd>⌥⇧R</kbd></button></header>
      <div className="filters">{['All', 'Mine', 'From clients', 'Live sessions'].map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div>
      {showLocal && recordings.length > 0 && <><h2>Your local captures</h2><div className="grid">{recordings.map((recording) => <button className="card" key={recording.id} onClick={() => location.assign(new URL(`/record.html?recording=${recording.id}`, browser.runtime.getURL('/private.html')).toString())}><div className="thumbnail actual">{recording.thumbnailDataUrl ? <img src={recording.thumbnailDataUrl} alt="" /> : <MonitorUp size={30} />}<span className="avatar">TO</span><time>{formatRecordingTime(recording.durationMs)}</time>{recording.marks.length > 0 && <i className="mark" />}</div><div className="card-copy"><strong>{recording.title}</strong><p>{recording.authorName} · just now</p><div><span className="status open">Ready</span><small><Pin size={11} />{recording.marks.length} marks</small></div></div></button>)}</div></>}
      <div className="section-heading"><h2>{recordings.length ? 'Demo library' : 'Demo recordings'}</h2><span>Frontend fixtures</span></div>
      <div className="grid">{visibleDemoCards.map((card) => <article className="card fixture" key={card.id}><div className={`thumbnail ${card.tone}`}><div className="wireframe"><i /><i /><i /></div><span className="avatar">{card.author.slice(0, 2).toUpperCase()}</span><time>{card.duration}</time><b className="scribble" /></div><div className="card-copy"><strong>{card.title}</strong><p>{card.author} · today</p><div><span className={`status ${card.status.toLowerCase().split(' ').join('-')}`}>{card.status}</span><small><Clock3 size={11} />{card.marks}</small></div></div></article>)}</div>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<RecordingsApp />)
