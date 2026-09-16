import { PillButton } from '../components/PillButton'
import { Wordmark } from '../components/Wordmark'
import type { AuditFinding, AuditObservation, AuditRunResponse, AuditSource } from '../../../shared/product-audit/contracts'
import { latestModelCapacityWait, useAuditRun } from '../../../shared/product-audit/useAuditRun'

const stages = [
  { id: 'explorer', name: 'Explorer', detail: 'Collect observable evidence' },
  { id: 'critic', name: 'Critic', detail: 'Generate candidate findings' },
  { id: 'verifier', name: 'Verifier', detail: 'Challenge, dedupe, admit' },
] as const
const sources: Array<{ id: AuditSource; name: string }> = [
  { id: 'url', name: 'URL' },
  { id: 'repository', name: 'Repository' },
  { id: 'design-system', name: 'Design system' },
  { id: 'customer-rule', name: 'Customer rules' },
]
type ProductAuditWorkspaceProps = { auditId?: string; apiBase?: string; accessToken?: string }
export function ProductAuditWorkspace({
  auditId = readAuditId(),
  apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api',
  accessToken,
}: ProductAuditWorkspaceProps) {
  const audit = useAuditRun(apiBase, auditId, accessToken)
  const run = audit.run
  const active = run && !['completed', 'partial', 'failed', 'cancelled'].includes(run.status)
  const successful = run?.status === 'completed' || run?.status === 'partial'
  const capacityWait = latestModelCapacityWait(audit.events)

  return (
    <main className="audit-workspace scanlines">
      <header className="audit-workspace-nav">
        <a href="/" aria-label="Back to CRRT landing"><Wordmark level="nav" /></a>
        <div className="audit-workspace-nav-meta"><span>{run ? run.status.toUpperCase() : 'CONNECTING'}</span><a href="/#audit">← Back to landing</a></div>
      </header>

      <div className="audit-workspace-shell">
        <section className="audit-workspace-intro">
          <div><span className="section-marker">/ product audit · {auditId}</span><h1>Finding the CRRTs<br /><span>before your users do.</span></h1></div>
          <div className="audit-target">
            <span>TARGET</span><strong>{run?.inputUrl ?? 'Loading audit target…'}</strong>
            <small>{run ? `${run.mode} · created ${formatTime(run.createdAt)}` : 'Connecting securely with header credentials'}</small>
          </div>
        </section>

        <div className="audit-workspace-grid">
          <aside className="audit-stage-rail" aria-label="Audit progress">
            <div className="audit-rail-label">AGENT TRACE · {audit.events.length} EVENTS</div>
            {stages.map((stage, index) => {
              const completed = successful || run?.progress.completedStages.includes(stage.id)
              const state = completed ? 'done' : run?.stage === stage.id ? 'active' : 'queued'
              const label = capacityWait?.stage === stage.id ? 'waiting' : state
              return (
                <div className={`audit-stage audit-stage-${state}`} key={stage.id}>
                  <span className="audit-stage-node">{completed ? '✓' : `0${index + 1}`}</span>
                  <div><strong>{stage.name}</strong><span>{stage.detail}</span></div><small>{label}</small>
                </div>
              )
            })}
            <SourceInventory run={run} />
            {active && <PillButton variant="ghost" size="sm" withCarrot={false} disabled={audit.cancelling} onClick={() => void audit.cancel()}>{audit.cancelling ? 'Cancelling…' : 'Cancel audit'}</PillButton>}
          </aside>

          <section className="audit-results" aria-live="polite">
            {!run ? <AuditLoading error={audit.error} /> : <AuditResult run={run} pollingError={audit.error} capacityWait={capacityWait} />}
          </section>
        </div>
      </div>
    </main>
  )
}

function readAuditId() {
  if (typeof window === 'undefined') return ''
  const segments = window.location.pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

function SourceInventory({ run }: { run: AuditRunResponse | null }) {
  return (
    <div className="audit-source-inventory">
      {sources.map((source) => {
        const evaluated = run?.coverage.evaluatedSources.includes(source.id)
        const unavailable = run?.coverage.unavailableSources.includes(source.id)
        return <div key={source.id}><span>{source.name}</span><strong>{evaluated ? 'evaluated' : unavailable ? 'unavailable' : 'pending'}</strong></div>
      })}
    </div>
  )
}

function AuditLoading({ error }: { error: string | null }) {
  return <div className="audit-running"><span className="audit-running-scan" aria-hidden>▰▰▱▱▱▱▱▱▱▱</span><p>LOADING_AUDIT</p><h2>{error ?? 'Connecting to durable execution'}<span className="cursor-blink">_</span></h2><small>Anonymous capability tokens stay in request headers.</small></div>
}

function AuditResult({ run, pollingError, capacityWait }: { run: AuditRunResponse; pollingError: string | null; capacityWait: ReturnType<typeof latestModelCapacityWait> }) {
  if (run.status === 'failed' || run.status === 'cancelled') {
    return <div className="audit-running audit-terminal-state"><p>{run.status.toUpperCase()}</p><h2>{run.status === 'cancelled' ? 'This audit was cancelled.' : 'The audit failed safely.'}</h2><small>{run.error?.message ?? pollingError ?? 'No unsupported findings were created.'}</small></div>
  }
  if ((run.status === 'completed' || run.status === 'partial') && run.report) return <AuditComplete run={run} findings={run.report.findings} observations={run.report.observations ?? []} />
  if (capacityWait) {
    return <div className="audit-running"><span className="audit-running-scan" aria-hidden>▰▰▰▱▱▱▱▱▱▱</span><p>WAITING_FOR_MODEL_CAPACITY</p><h2>Gateway capacity is temporarily limited<span className="cursor-blink">_</span></h2><small>{capacityWait.retryAt ? `Retrying after ${formatTime(capacityWait.retryAt)}. The audit lease has been released safely.` : 'The audit will retry with durable backoff.'}</small></div>
  }
  const activeStage = stages.find((stage) => stage.id === run.stage)
  if (!activeStage) {
    return <div className="audit-running"><span className="audit-running-scan" aria-hidden>▰▱▱▱▱▱▱▱▱▱</span><p>AUDIT_QUEUED</p><h2>Waiting for durable execution<span className="cursor-blink">_</span></h2><small>{pollingError ?? 'The audit is accepted and will start as soon as an execution worker is available.'}</small></div>
  }
  return <div className="audit-running"><span className="audit-running-scan" aria-hidden>▰▰▰▱▱▱▱▱▱▱</span><p>{activeStage.name.toUpperCase()}_IN_PROGRESS</p><h2>{activeStage.detail}<span className="cursor-blink">_</span></h2><small>{pollingError ?? 'Findings stay hidden until Verifier can defend them.'}</small></div>
}

function AuditComplete({ run, findings, observations }: { run: AuditRunResponse; findings: AuditFinding[]; observations: AuditObservation[] }) {
  const partial = run.status === 'partial'
  return (
    <>
      <div className="audit-results-summary">
        <div>
          <span className="phosphor-eyebrow">{partial ? 'partial coverage' : 'audit complete'}</span>
          <h2>{findings.length === 0 ? 'No findings cleared the bar.' : `${findings.length} finding${findings.length === 1 ? '' : 's'} cleared the bar.`}</h2>
          <p>{partial ? run.coverage.partialReason : 'Every admitted claim links back to observable evidence. The report is never padded.'}</p>
          {run.completedAt && <small>Completed {formatTime(run.completedAt)}</small>}
        </div>
        <div className="audit-score"><strong>{findings.length}</strong><span>OPEN</span><small>0 padded</small></div>
      </div>
      {findings.length > 0 && <div className="audit-findings-list">{findings.map((finding, index) => (
        <article className="audit-finding" key={finding.id}>
          <div className="audit-finding-number">{String(index + 1).padStart(2, '0')}</div>
          <div className="audit-finding-body">
            <div className="audit-finding-meta"><span>{finding.impact.toUpperCase()} IMPACT</span><span>{Math.round(finding.confidence * 100)}% CONFIDENCE</span><span>{finding.status.toUpperCase()}</span></div>
            <h3>{finding.title}</h3><p>{finding.summary}</p>
            <div className="audit-evidence-list">{finding.evidence.map((evidence) => (
              <div key={evidence.id}><span>↳ {evidence.source} · {evidence.location}</span><p>{evidence.observation}</p><small>{evidence.provenance?.collector ? `Collected by ${String(evidence.provenance.collector)}` : 'Observable URL evidence'}{evidence.capture?.capturedAt ? ` · ${formatTime(String(evidence.capture.capturedAt))}` : ''}</small></div>
            ))}</div>
            <div className="audit-recommendation"><span>NEXT MOVE</span><p>{finding.recommendation}</p></div>
          </div>
        </article>
      ))}</div>}
      {observations.length > 0 && <section className="audit-observations" aria-labelledby="audit-observations-title">
        <div className="audit-observations-heading"><span className="phosphor-eyebrow">needs more evidence</span><h3 id="audit-observations-title">{observations.length} candidate observation{observations.length === 1 ? '' : 's'} not admitted</h3><p>These may be worth investigating, but they are not Open findings.</p></div>
        {observations.map((observation) => <article className="audit-observation" key={observation.id}>
          <div className="audit-finding-meta"><span>{observation.impact.toUpperCase()} IMPACT</span><span>{Math.round(observation.confidence * 100)}% CONFIDENCE</span><span>NEEDS MORE EVIDENCE</span></div>
          <h4>{observation.title}</h4><p>{observation.summary}</p>
          <div className="audit-evidence-list">{observation.evidence.map((evidence) => <div key={evidence.id}><span>↳ {evidence.source} · {evidence.location}</span><p>{evidence.observation}</p><small>{evidence.provenance?.collector ? `Collected by ${String(evidence.provenance.collector)}` : 'Observable URL evidence'}</small></div>)}</div>
          <small>{observation.reason}</small>
        </article>)}
      </section>}
    </>
  )
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
