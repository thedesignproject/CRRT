import { useState } from 'react'
import { Camera, CheckCircle2, Clock3, Copy, Film, MonitorUp, Pin, Plus, Sparkles, X } from 'lucide-react'

const recordings = [
  { title: 'Checkout: pay button barely readable', author: 'Sofia · client', duration: '0:42', marks: '2 drawings · 1 pin · 1 note', tone: 'cream', status: 'Sent to Claude Code' },
  { title: 'Onboarding step 3, tightening the copy', author: 'Lu · PM', duration: '6:18', marks: '9 marks · 4 zooms', tone: 'blue', status: 'Agent working' },
  { title: 'Nav spacing on mobile', author: 'Tomás · design', duration: '0:28', marks: '1 mark · 1 box', tone: 'stone', status: 'Fixed' },
  { title: 'Pricing page review before Friday', author: 'Marcos · client', duration: '2:10', marks: '5 marks', tone: 'orange', status: 'Open' },
  { title: 'Empty states pass with the agent', author: 'Tomás · design', duration: '12:40', marks: '14 marks · 3 zooms', tone: 'green', status: 'Live session' },
  { title: 'Dashboard chart colors', author: 'Dani · design', duration: '0:37', marks: '2 boxes · 1 note', tone: 'dark', status: 'Sent to Claude Code' },
]

function statusClass(status: string) {
  return status.toLowerCase().split(' ').join('-')
}

export function RecordingsPage() {
  const [filter, setFilter] = useState('All')
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  async function copyShortcut() {
    await navigator.clipboard.writeText('⌥⇧R')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  const visibleRecordings = recordings.filter((recording) => {
    if (filter === 'Mine') return recording.author.startsWith('Tomás')
    if (filter === 'From clients') return recording.author.includes('client')
    if (filter === 'Live sessions') return recording.status === 'Live session'
    return true
  })
  return <section className="recordings-page">
    <header className="recordings-hero">
      <div><span className="recordings-kicker"><Sparkles size={12} />CRRT Record · frontend demo</span><h1>Recordings</h1><p>Show it once. Your team watches it, your agent reads it.</p></div>
      <button type="button" className="recordings-new" onClick={() => setLauncherOpen(true)}><Plus size={16} />New recording <kbd>⌥⇧R</kbd></button>
    </header>
    <div className="recordings-filters">{['All', 'Mine', 'From clients', 'Live sessions'].map((value) => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <div className="recordings-grid">{visibleRecordings.map((recording) => <article className="recording-card" key={recording.title}>
      <div className={`recording-thumb ${recording.tone}`}><div className="recording-wireframe"><i /><i /><i /></div><span className="recording-avatar">{recording.author.slice(0, 2).toUpperCase()}</span><time>{recording.duration}</time><b /></div>
      <div className="recording-copy"><strong>{recording.title}</strong><p>{recording.author} · today</p><div><span className={`recording-status ${statusClass(recording.status)}`}>{recording.status}</span><small><Pin size={11} />{recording.marks}</small></div></div>
    </article>)}</div>
    <div className="recordings-contract"><div><MonitorUp size={18} /><span><strong>Recorder lives in the Chrome extension</strong><small>The dashboard is the library and launcher. Production media arrives through Pranav's upload contract.</small></span></div><div><Film size={18} /><span><strong>Human links stay simple</strong><small>Viewers open a Loom-like page. No extension or CRRT account required.</small></span></div><div><CheckCircle2 size={18} /><span><strong>Agent context is structured</strong><small>Transcript, keyframes, marks and DOM targets become a paid handoff.</small></span></div></div>
    {launcherOpen && <div className="record-launcher-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setLauncherOpen(false) }}><section className="record-launcher" role="dialog" aria-modal="true" aria-labelledby="record-launcher-title"><button type="button" className="record-launcher-close" onClick={() => setLauncherOpen(false)} aria-label="Close"><X size={18} /></button><span className="record-launcher-icon"><Camera size={24} /></span><h2 id="record-launcher-title">Open CRRT Record</h2><p>The recorder runs in the Chrome extension so it can capture a tab, window, or entire screen and preserve DOM context.</p><div className="record-launcher-shortcut"><span><kbd>⌥</kbd><kbd>⇧</kbd><kbd>R</kbd></span><button type="button" onClick={() => { void copyShortcut() }}>{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy shortcut'}</button></div><ol><li>Pin CRRT in the Chrome toolbar.</li><li>Press the shortcut or choose <strong>Record</strong>.</li><li>Pick what to share and start talking.</li></ol><button type="button" className="record-launcher-done" onClick={() => setLauncherOpen(false)}>Got it</button><small><Clock3 size={11} />The production launcher will detect installation and offer the Chrome Web Store when needed.</small></section></div>}
  </section>
}
