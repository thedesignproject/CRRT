import { useEffect, useRef, useState } from 'react'

export function ExportProjectFeedback({ apiBase, accessToken, projectKey }: { apiBase: string; accessToken: string; projectKey: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lifetime = useRef(0)
  useEffect(() => { lifetime.current += 1; setBusy(false); setError(''); return () => { lifetime.current += 1 } }, [apiBase,accessToken,projectKey])
  async function download() {
    const requestLifetime = lifetime.current
    setBusy(true); setError('')
    try {
      const response = await fetch(`${apiBase}/v1/projects/${encodeURIComponent(projectKey)}/export`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) throw new Error('Export unavailable')
      const blob = await response.blob()
      if (lifetime.current !== requestLifetime) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'crrt-feedback.json'; link.click(); URL.revokeObjectURL(url)
    } catch { if (lifetime.current === requestLifetime) setError('Feedback export is temporarily unavailable. Retry shortly.') }
    finally { if (lifetime.current === requestLifetime) setBusy(false) }
  }
  return <div className="mt-4">
    <button className="rounded-full border border-border px-4 py-2 text-xs disabled:opacity-50" disabled={busy} onClick={() => { void download() }}>Export project feedback</button>
    <p className="mt-2 text-xs text-muted-foreground">Available after cancellation. Exports include only feedback you have permission to read.</p>
    {error && <p role="alert" className="mt-2 text-xs text-muted-foreground">{error}</p>}
  </div>
}
