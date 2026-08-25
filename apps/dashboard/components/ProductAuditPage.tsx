import { useEffect, useState, type FormEvent } from 'react'
import type { AuditFinding, AuditObservation, AuditRunResponse } from '../../../shared/product-audit/contracts'
import { createAudit } from '../../../shared/product-audit/browser-client'
import { latestModelCapacityWait, useAuditRun } from '../../../shared/product-audit/useAuditRun'
import { listProjects, type Project } from '../api'
import { asset, route } from '../lib/routes'
import { Spinner } from './primitives'
type Props = { apiBase: string; accessToken: string; auditId: string }
export function ProductAuditPage(props: Props) {
  return props.auditId === 'new' ? <ProjectAuditLauncher {...props} /> : <ProjectAuditRun {...props} />
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="h-[60px] px-5 border-b border-border bg-card flex items-center justify-between">
        <a href={route('/')} className="flex items-center gap-2 font-crt"><img src={asset('crrt-isologo.png')} alt="" width={24} height={24} style={{ imageRendering: 'pixelated' }} />CRRT.</a>
        <a href={route('/')} className="text-xs text-muted-foreground hover:text-foreground">← Feedback dashboard</a>
      </header>
      {children}
    </main>
  )
}
function ProjectAuditLauncher({ apiBase, accessToken }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectKey, setProjectKey] = useState('')
  const [url, setUrl] = useState('https://')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void listProjects(apiBase, accessToken).then((items) => {
      if (!active) return
      setProjects(items); setProjectKey(items[0]?.publicKey ?? ''); setLoading(false)
    }).catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : 'Could not load projects'); setLoading(false) } })
    return () => { active = false }
  }, [accessToken, apiBase])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !projectKey) return
    setSubmitting(true); setError(null)
    try {
      const audit = await createAudit(apiBase, { url: url.trim(), projectKey, accessToken })
      window.location.assign(route(`/audits/${audit.auditId}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start audit')
      setSubmitting(false)
    }
  }
  return (
    <Shell>
      <section className="max-w-2xl mx-auto px-6 py-16">
        <span className="crrt-section-marker">/ product audit · new run</span>
        <h1 className="mt-4 text-3xl font-bold">Audit a public product URL</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-6">Explorer observes the URL. Critic proposes candidates. Verifier admits only defensible Open findings.</p>
        <form onSubmit={submit} className="mt-8 border border-border rounded-xl bg-card p-6 grid gap-5">
          <label className="grid gap-2 text-xs font-semibold">Project
            <select disabled={loading} value={projectKey} onChange={(event) => setProjectKey(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {projects.map((project) => <option value={project.publicKey} key={project.publicKey}>{project.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-xs font-semibold">Product URL
            <input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono" />
          </label>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <button disabled={submitting || loading || !projectKey} className="h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{submitting ? 'Starting audit…' : 'Run product audit'}</button>
        </form>
      </section>
    </Shell>
  )
}
function ProjectAuditRun({ apiBase, accessToken, auditId }: Props) {
  const audit = useAuditRun(apiBase, auditId, accessToken)
  const run = audit.run
  const terminal = run && ['completed', 'partial', 'failed', 'cancelled'].includes(run.status)
  const successful = run?.status === 'completed' || run?.status === 'partial'
  const capacityWait = latestModelCapacityWait(audit.events)
  return (
    <Shell>
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-wrap gap-4 items-end justify-between border-b border-border pb-7">
          <div><span className="crrt-section-marker">/ product audit · {auditId}</span><h1 className="mt-3 text-2xl font-bold">{run?.inputUrl ?? 'Loading audit…'}</h1><p className="mt-2 text-xs text-muted-foreground">{run ? `${run.status} · ${run.stage} · created ${formatTime(run.createdAt)}` : 'Connecting to durable execution'}</p></div>
          {run && !terminal && <button onClick={() => void audit.cancel()} disabled={audit.cancelling} className="px-3 py-2 border border-border rounded-md text-xs hover:bg-accent disabled:opacity-50">{audit.cancelling ? 'Cancelling…' : 'Cancel audit'}</button>}
        </div>
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-8 pt-8">
          <aside className="space-y-3">
            {['explorer', 'critic', 'verifier'].map((stage, index) => {
              const complete = successful || run?.progress.completedStages.includes(stage as never)
              const active = run?.stage === stage
              return <div key={stage} className={`border rounded-lg p-3 ${active ? 'border-primary bg-card' : 'border-border'}`}><div className="flex justify-between text-xs"><strong className="capitalize">{index + 1}. {stage}</strong><span className="text-muted-foreground">{complete ? 'done' : capacityWait?.stage === stage ? 'waiting' : active ? 'active' : 'queued'}</span></div></div>
            })}
            <div className="pt-4 mt-4 border-t border-border space-y-2 text-xs">{['url', 'repository', 'design-system', 'customer-rule'].map((source) => <div className="flex justify-between" key={source}><span className="text-muted-foreground">{source}</span><strong>{run?.coverage.evaluatedSources.includes(source as never) ? 'evaluated' : run?.coverage.unavailableSources.includes(source as never) ? 'unavailable' : 'pending'}</strong></div>)}</div>
          </aside>
          <div aria-live="polite">{!run ? <div className="min-h-72 grid place-items-center border border-border rounded-xl bg-card"><div className="flex items-center gap-3 text-sm text-muted-foreground"><Spinner size={16} />{audit.error ?? 'Loading audit state…'}</div></div> : <DashboardResult run={run} pollingError={audit.error} capacityWait={capacityWait} />}</div>
        </div>
      </section>
    </Shell>
  )
}
function DashboardResult({ run, pollingError, capacityWait }: { run: AuditRunResponse; pollingError: string | null; capacityWait: ReturnType<typeof latestModelCapacityWait> }) {
  if (run.status === 'failed' || run.status === 'cancelled') return <div className="border border-border rounded-xl bg-card p-8"><span className="crrt-section-marker">{run.status}</span><h2 className="mt-3 text-xl font-bold">{run.status === 'failed' ? 'The audit failed safely.' : 'The audit was cancelled.'}</h2><p className="mt-2 text-sm text-muted-foreground">{run.error?.message ?? pollingError ?? 'No unsupported findings were created.'}</p></div>
  if (!run.report) return <div className="min-h-72 grid place-items-center border border-border rounded-xl bg-card text-center p-8"><div><p className="font-crt text-primary uppercase">{capacityWait ? 'waiting_for_model_capacity' : `${run.stage}_in_progress`}</p><h2 className="mt-2 text-xl font-bold">{capacityWait ? 'Gateway capacity is temporarily limited.' : 'Findings remain hidden until verification.'}</h2><p className="mt-2 text-xs text-muted-foreground">{pollingError ?? (capacityWait?.retryAt ? `Retrying after ${formatTime(capacityWait.retryAt)}. The stage lease is safely released.` : `${run.progress.observedEvidenceCount} evidence · ${run.progress.candidateCount} candidates`)}</p></div></div>
  return <Report run={run} findings={run.report.findings} observations={run.report.observations ?? []} />
}
function Report({ run, findings, observations }: { run: AuditRunResponse; findings: AuditFinding[]; observations: AuditObservation[] }) {
  const heading = findings.length === 0
    ? 'No findings cleared the bar.'
    : `${findings.length} Open finding${findings.length === 1 ? '' : 's'} cleared the bar.`
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-xl bg-card p-6">
        <span className="crrt-section-marker">{run.status === 'partial' ? 'partial coverage' : 'audit complete'}</span>
        <h2 className="mt-3 text-xl font-bold">{heading}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {run.coverage.partialReason ?? 'No padding. Every finding includes evidence provenance.'}
          {run.completedAt ? ` Completed ${formatTime(run.completedAt)}.` : ''}
        </p>
      </div>
      {findings.map((finding, index) => (
        <article className="border border-border rounded-xl bg-card p-6" key={finding.id}>
          <div className="flex flex-wrap gap-2 text-[11px] font-crt text-primary"><span>{String(index + 1).padStart(2, '0')}</span><span>{finding.impact} impact</span><span>{Math.round(finding.confidence * 100)}% confidence</span><span>{finding.status}</span></div>
          <h3 className="mt-3 text-lg font-bold">{finding.title}</h3><p className="mt-2 text-sm text-muted-foreground leading-6">{finding.summary}</p>
          <div className="mt-4 space-y-2">{finding.evidence.map((evidence) => <div className="border-l-2 border-primary bg-background p-3" key={evidence.id}><p className="text-[11px] font-crt text-muted-foreground">{evidence.source} · {evidence.location} · {evidence.provenance?.collector ? String(evidence.provenance.collector) : 'observable evidence'}</p><p className="mt-1 text-xs leading-5">{evidence.observation}</p></div>)}</div>
          <div className="mt-4 pt-4 border-t border-border"><span className="text-[11px] font-crt text-primary">NEXT MOVE</span><p className="mt-1 text-xs">{finding.recommendation}</p></div>
        </article>
      ))}
      {observations.length > 0 && <section className="border border-border rounded-xl bg-card p-6" aria-labelledby="candidate-observations-title">
        <span className="crrt-section-marker">needs more evidence</span>
        <h3 id="candidate-observations-title" className="mt-3 text-lg font-bold">{observations.length} candidate observation{observations.length === 1 ? '' : 's'} not admitted</h3>
        <p className="mt-2 text-xs text-muted-foreground">These may be worth investigating, but they are not Open findings.</p>
        <div className="mt-4 space-y-4">{observations.map((observation) => <article className="border-t border-border pt-4" key={observation.id}>
          <div className="flex flex-wrap gap-2 text-[11px] font-crt text-muted-foreground"><span>{observation.impact} impact</span><span>{Math.round(observation.confidence * 100)}% confidence</span><span>needs more evidence</span></div>
          <h4 className="mt-2 font-bold">{observation.title}</h4><p className="mt-1 text-xs text-muted-foreground leading-5">{observation.summary}</p>
          <div className="mt-3 space-y-2">{observation.evidence.map((evidence) => <div className="border-l-2 border-border bg-background p-3" key={evidence.id}><p className="text-[11px] font-crt text-muted-foreground">{evidence.source} · {evidence.location} · {evidence.provenance?.collector ? String(evidence.provenance.collector) : 'observable evidence'}</p><p className="mt-1 text-xs leading-5">{evidence.observation}</p></div>)}</div>
          <p className="mt-3 text-[11px] text-muted-foreground">{observation.reason}</p>
        </article>)}</div>
      </section>}
    </div>
  )
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
