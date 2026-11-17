import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowRight, Bot, Check, GitPullRequest, RotateCcw, X } from 'lucide-react'
import { FeedbackWidget } from '@widget/components/FeedbackWidget'
import type { Comment } from '../../../src/components/FeedbackWidget/types'
import type { DemoComments } from '../lib/demoComments'
import { GitHubMark, LinearMark, JiraMark } from '../sections/Integrations'
import './landing-demo.css'

const destinations = ['Claude Code', 'Codex', 'Cursor', 'GitHub', 'Linear', 'Jira'] as const
type Destination = typeof destinations[number]
type Phase = 'review' | 'send' | 'sent' | 'result' | 'done'

export function LandingFeedbackDemo({ apiBase, projectId, demoComments }: { apiBase: string; projectId: string; demoComments: DemoComments }) {
  const comments = useSyncExternalStore(demoComments.subscribe, demoComments.getSnapshot, demoComments.getSnapshot)
  const [panel, setPanel] = useState<{ commentId?: string } | null>(null)
  const adapter = useMemo(() => ({ ...demoComments, handoff: {
    label: 'Send feedback',
    description: 'Interactive demo · no real changes',
    open: (commentId?: string) => setPanel({ commentId }),
  } }), [demoComments])
  return <>
    <FeedbackWidget apiBase={apiBase} projectId={projectId} personalComments={adapter} />
    {panel && <DemoWorkflow comments={comments} demo={demoComments} initialId={panel.commentId} onClose={() => setPanel(null)} />}
  </>
}

export function DemoWorkflow({ comments, demo, initialId, onClose }: { comments: Comment[]; demo: DemoComments; initialId?: string; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [phase, setPhase] = useState<Phase>('review')
  const [selected, setSelected] = useState<string[]>(() => initialId ? [initialId] : comments.filter(comment => comment.reviewStatus !== 'rejected').map(comment => comment.id))
  const [destination, setDestination] = useState<Destination>('Claude Code')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = comments.filter(comment => selected.includes(comment.id))
  const tracker = ['GitHub', 'Linear', 'Jira'].includes(destination)
  const stage = phase === 'review' ? 0 : phase === 'send' ? 1 : 2

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  async function prepare() {
    setBusy(true); setError('')
    try {
      await Promise.all(chosen.map(comment => demo.review(comment.id, 'accepted')))
      setTitle(chosen[0].body.slice(0, 120))
      setPhase('send')
    } catch { setError('Could not prepare this demo. Try again.') }
    finally { setBusy(false) }
  }

  async function sample() {
    const comment = await demo.create({ pageUrl: window.location.href, selector: 'h1', x: 50, y: 10, body: 'Make the primary action stand out so it is easier to find.' })
    setSelected([comment.id])
  }

  return <dialog ref={dialog} className="landing-demo-dialog" aria-labelledby="demo-title" onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="landing-demo-header">
      <div><span className="landing-demo-badge">Interactive demo</span><h2 id="demo-title">{phase === 'done' ? 'One fix, reviewed.' : phase === 'result' ? 'Review the demo fix' : phase === 'sent' ? 'Demo handoff created' : phase === 'send' ? 'Send feedback' : 'Review your feedback'}</h2></div>
      <button className="landing-demo-close" aria-label="Close demo" onClick={onClose}><X size={20} /></button>
    </header>
    <p className="landing-demo-notice">Everything stays in this tab. No agent runs, tickets, or code changes are created.</p>
    <ol className="landing-demo-steps" aria-label="Demo progress">
      {['Review', 'Send', 'Verify'].map((label, index) => <li key={label} aria-current={index === stage ? 'step' : undefined}><span>{index < stage ? <Check size={12} /> : index + 1}</span>{label}</li>)}
    </ol>
    <div className="landing-demo-body">
      {error && <p role="alert">{error}</p>}
      {phase === 'review' && <>
        {comments.length === 0 ? <div className="landing-demo-empty"><Bot size={28} /><h3>Try the whole workflow</h3><p>Leave a comment on this page, or start with sample feedback.</p><button className="landing-demo-primary" onClick={() => void sample()}>Use sample feedback</button></div> : <>
          <p className="landing-demo-lead">Choose the feedback you want to mark Ready for Agent.</p>
          <ul className="landing-demo-comments">{comments.map(comment => <li key={comment.id}>
            <label><input type="checkbox" checked={selected.includes(comment.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, comment.id] : ids.filter(id => id !== comment.id))} /><span><strong>{comment.body}</strong><small>{comment.reviewStatus === 'accepted' ? 'Ready for Agent' : comment.reviewStatus === 'rejected' ? 'Rejected' : 'Needs review'} · {comment.selector}</small></span></label>
            {comment.imageUrl && <img src={comment.imageUrl} alt="Captured context for this feedback" />}
          </li>)}</ul>
          <button className="landing-demo-primary" disabled={!chosen.length || busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Mark ready and continue'}<ArrowRight size={16} /></button>
        </>}
      </>}
      {phase === 'send' && <>
        <p className="landing-demo-lead">{chosen.length} ready comment{chosen.length === 1 ? '' : 's'}. Choose where to send the context.</p>
        <fieldset className="landing-demo-destinations"><legend>Destination</legend>{destinations.map(name => <label key={name}><input type="radio" name="demo-destination" value={name} checked={destination === name} onChange={() => setDestination(name)} />{name === 'GitHub' ? <GitHubMark /> : name === 'Linear' ? <LinearMark /> : name === 'Jira' ? <JiraMark /> : <Bot size={20} />}<span>{name}</span></label>)}</fieldset>
        <label className="landing-demo-title">{tracker ? 'Issue title' : 'Change request'}<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
        <details className="landing-demo-context"><summary>Included context</summary>{chosen.map(comment => <div key={comment.id}><strong>{comment.body}</strong><p>{comment.pageUrl}</p><code>{comment.selector}</code><p>{comment.imageUrl ? 'Screenshot captured' : 'Text and element context'}</p></div>)}</details>
        <div className="landing-demo-actions"><button className="landing-demo-secondary" onClick={() => setPhase('review')}><ArrowLeft size={16} />Back</button><button className="landing-demo-primary" disabled={!title.trim()} onClick={() => setPhase('sent')}>Send to {destination}<ArrowRight size={16} /></button></div>
      </>}
      {phase === 'sent' && <div className="landing-demo-result" role="status"><Check size={28} /><h3>{tracker ? `Demo issue in ${destination}` : `Demo request sent to ${destination}`}</h3><p>{title}</p><p>{tracker ? 'The simulated issue contains your selected feedback and its context.' : 'Your selected feedback and context are ready for a simulated coding agent.'}</p><button className="landing-demo-primary" onClick={() => setPhase('result')}>Review demo result<ArrowRight size={16} /></button></div>}
      {phase === 'result' && <>
        <div className="landing-demo-result-heading"><GitPullRequest size={24} /><div><h3>Draft change ready for review</h3><p>Illustrative result · not a generated fix for your page</p></div></div>
        <p className="landing-demo-lead">In the real workflow, your agent drafts a change and you test it before approving. Here is an example of making a primary action easier to find.</p>
        <div className="landing-demo-comparison">{[false, true].map(fixed => <figure key={String(fixed)}><figcaption>{fixed ? 'After' : 'Before'}</figcaption><div className="landing-demo-preview"><strong>Start your next project</strong><p>Keep feedback and fixes in one place.</p><span className={fixed ? 'is-fixed' : ''}>Create project<ArrowRight size={14} /></span></div></figure>)}</div>
        <div className="landing-demo-actions"><button className="landing-demo-secondary" onClick={() => setPhase('send')}>Request changes</button><button className="landing-demo-primary" onClick={() => setPhase('done')}><Check size={16} />Approve demo fix</button></div>
      </>}
      {phase === 'done' && <div className="landing-demo-result" role="status"><Check size={32} /><h3>Feedback → reviewed fix</h3><p>You captured feedback, marked it ready, sent the context, and reviewed a simulated result.</p><a className="landing-demo-primary" href="/dashboard">Try it on your project<ArrowRight size={16} /></a><button className="landing-demo-secondary" onClick={() => setPhase('review')}>Review more feedback</button></div>}
    </div>
    <footer className="landing-demo-footer"><span>Demo only · nothing is sent externally</span><button onClick={() => { demo.reset(); onClose() }} disabled={busy}><RotateCcw size={14} />Reset demo</button></footer>
  </dialog>
}
