import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { requestRecordingPermissions } from '../../lib/recording-permissions'
import '../record/style.css'

export function RecordingPermissions() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)
  async function allow() {
    setPending(true)
    setError('')
    try {
      const query = new URLSearchParams(location.search)
      await requestRecordingPermissions({ cameraEnabled: query.get('camera') === '1', microphoneEnabled: query.get('microphone') === '1' })
      const response = await browser.runtime.sendMessage({ type: 'record:permissions-ready', sessionId: query.get('session') })
      if (!response?.ok) throw new Error(response?.error || 'Recording setup expired. Close this window and start again.')
      setStarted(true)
    } catch {
      setError('Camera or microphone access was not allowed. Allow access in Chrome and your system settings, then try again. You can also close this window and record with these devices off.')
    } finally {
      setPending(false)
    }
  }
  return <main className="controller-page"><section className="controller-card">
    <h1>{started ? 'Recording in progress' : 'Allow recording devices'}</h1>
    <p>{started ? 'Use the controls on your recorded page. Keep this window open so temporary camera and microphone permission stays active. It closes when you finish.' : 'Chrome needs your permission for the camera or microphone you selected. Your recording starts after you allow access.'}</p>
    {error && <p role="alert">{error}</p>}
    {!started && <button disabled={pending} onClick={() => { void allow() }}>{pending ? 'Starting recording…' : 'Allow access and continue'}</button>}
  </section></main>
}

createRoot(document.getElementById('root')!).render(<RecordingPermissions />)
