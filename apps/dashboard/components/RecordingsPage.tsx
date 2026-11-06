import { useCallback, useState } from 'react'
import { RecordingLibrary, type RecordingPage } from '../../../shared/record/Library'
import { recordRequest } from '../../../shared/record/client'
import { route } from '../lib/routes'
import { RecordingShareButton } from './RecordingShareButton'
import { Camera, CheckCircle2, Clock3, Copy, Plus, Sparkles, X } from 'lucide-react'

export function RecordingsPage({ apiBase, accessToken }: { apiBase: string; accessToken: string }) {
  const load = useCallback((before?: string) => recordRequest<RecordingPage>(apiBase, `recordings${before ? `?before=${encodeURIComponent(before)}` : ''}`, accessToken), [apiBase, accessToken])
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  async function copyShortcut() {
    await navigator.clipboard.writeText('⌥⇧R')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  return <section className="recordings-page">
    <header className="recordings-hero">
      <div><span className="recordings-kicker"><Sparkles size={12} />CRRT Record</span><h1>Recordings</h1><p>Show it once. Your team watches it, your agent reads it.</p></div>
      <button type="button" className="recordings-new" onClick={() => setLauncherOpen(true)}><Plus size={16} />New recording <kbd>⌥⇧R</kbd></button>
    </header>
    <RecordingLibrary load={load} href={id => `${route("/recording")}?id=${id}`} remove={id => recordRequest(apiBase, `recordings/${id}`, accessToken, undefined, 'DELETE')} actions={row => <RecordingShareButton id={row.id} title={row.title} apiBase={apiBase} accessToken={accessToken} />} />
    {launcherOpen && <div className="record-launcher-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setLauncherOpen(false) }}><section className="record-launcher" role="dialog" aria-modal="true" aria-labelledby="record-launcher-title"><button type="button" className="record-launcher-close" onClick={() => setLauncherOpen(false)} aria-label="Close"><X size={18} /></button><span className="record-launcher-icon"><Camera size={24} /></span><h2 id="record-launcher-title">Open CRRT Record</h2><p>The recorder runs in the Chrome extension so it can capture a tab, window, or entire screen and preserve DOM context.</p><div className="record-launcher-shortcut"><span><kbd>⌥</kbd><kbd>⇧</kbd><kbd>R</kbd></span><button type="button" onClick={() => { void copyShortcut() }}>{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy shortcut'}</button></div><ol><li>Pin CRRT in the Chrome toolbar.</li><li>Press the shortcut or choose <strong>Record</strong>.</li><li>Pick what to share and start talking.</li></ol><button type="button" className="record-launcher-done" onClick={() => setLauncherOpen(false)}>Got it</button><small><Clock3 size={11} />Install and pin the CRRT extension to start recording.</small></section></div>}
  </section>
}
