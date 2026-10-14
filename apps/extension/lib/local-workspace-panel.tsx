import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, CloudUpload, Download } from 'lucide-react'
import { LocalFeedbackList } from './local-feedback-list'
import { importLocalProject } from './comments-api'
import { deleteLocalComment, exportLocalFeedback, readLocalWorkspace, resolveLocalComment, type LocalWorkspace } from './local-feedback'

export function LocalWorkspacePanel({ sessionToken, billingUrl }: { sessionToken: string|null; billingUrl: string }) {
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null)
  const [projectId, setProjectId] = useState('local-feedback')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [showImport, setShowImport] = useState(false)
  useEffect(() => { setExpanded(false); setShowImport(false) }, [sessionToken])
  const identity=useRef({token:sessionToken,generation:0})
  if(identity.current.token!==sessionToken)identity.current={token:sessionToken,generation:identity.current.generation+1}
  const activeImport=useRef<AbortController|null>(null)
  useLayoutEffect(()=>()=>{
    identity.current={...identity.current,generation:identity.current.generation+1}
    activeImport.current?.abort()
  },[sessionToken])
  useEffect(() => { readLocalWorkspace().then(setWorkspace).catch(error => setMessage(String(error))) }, [])
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage('')
    try { await action(); setWorkspace(await readLocalWorkspace()) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Local feedback is unavailable') }
    finally { setBusy(false) }
  }
  async function exportFeedback() {
    const url = URL.createObjectURL(new Blob([await exportLocalFeedback()], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'crrt-local-feedback.json'
    link.click(); URL.revokeObjectURL(url)
  }
  async function importFeedback() {
    // Capture the visible session before the first asynchronous storage read.
    // Token changes also cover sign-out/relogin and refresh; retry is safe.
    const expected=identity.current
    const controller=new AbortController()
    activeImport.current=controller
    function assertCurrent(){
      if(identity.current.generation!==expected.generation)throw new Error('Sign-in changed; import stopped. Your local feedback is retained.')
    }
    try{
      const current = await readLocalWorkspace()
      assertCurrent()
      // Keep screenshot requests within hosted limits. Every batch checks the
      // background session immediately before fetch and pins its bearer token.
      if (!current.comments.length) await importLocalProject(projectId,current.name,[],expected.token!,controller.signal)
      for (const comment of current.comments){
        assertCurrent()
        await importLocalProject(projectId,current.name,[comment],expected.token!,controller.signal)
      }
      assertCurrent()
      setMessage('Imported into your project. The local copy is retained; retries do not count it again.')
    }catch(error){assertCurrent();throw error}
    finally{activeImport.current=null}
  }
  const comments = workspace?.comments ?? []
  return <section className="local-workspace" aria-label="Local feedback">
    {sessionToken && <div className="local-shortcuts">
      <button className="link local-shortcut" aria-expanded={expanded} aria-controls="local-feedback-details" onClick={() => setExpanded(value => !value)}>Local feedback ({comments.length})<ChevronDown size={12} aria-hidden="true" /></button>
      <button className="link local-shortcut" aria-expanded={showImport} aria-controls="local-feedback-import" onClick={() => setShowImport(value => !value)}><CloudUpload size={12} aria-hidden="true" />Import to Cloud</button>
    </div>}
    {(!sessionToken || expanded) && <div id="local-feedback-details" className="local-details">
    <header className="local-heading"><h2>Local feedback</h2><span className="local-count">{comments.length}/50</span></header>
    <p className="muted">One workspace, just you. Stored in this browser; no Cloud backups or sync.</p>
    <button className="secondary local-export" disabled={busy} onClick={() => { void run(exportFeedback) }}><Download size={14} aria-hidden="true" />Export local feedback</button>
    <LocalFeedbackList comments={comments} busy={busy} onResolve={comment => { void run(() => resolveLocalComment(comment.id, comment.reviewStatus !== 'accepted')) }} onDelete={id => { void run(() => deleteLocalComment(id)) }} />
    </div>}
    {sessionToken && showImport && <div id="local-feedback-import" className="local-import">
      <label>Cloud project key<input aria-label="Cloud project key" value={projectId} maxLength={63} onChange={event => setProjectId(event.target.value)} /></label>
      <button className="secondary" disabled={busy} onClick={() => { void run(importFeedback) }}>Import local project</button>
      <a href={billingUrl} target="_blank" rel="noopener noreferrer">Start a Cloud trial or manage your plan</a>
    </div>}
    {message && <p className="notice" role="status">{message}</p>}
  </section>
}
