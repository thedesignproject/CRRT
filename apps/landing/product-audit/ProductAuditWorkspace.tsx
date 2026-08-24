import { useEffect, useState } from 'react'
import { PillButton } from '../components/PillButton'
import { Wordmark } from '../components/Wordmark'
import { LOCAL_AUDIT_URL, runLocalAudit } from './localAudit'
import type { AuditFinding } from '../../../shared/product-audit/contracts'

const stages = [
  { name: 'Explorer', detail: 'Collect observable evidence' },
  { name: 'Critic', detail: 'Generate candidate findings' },
  { name: 'Verifier', detail: 'Challenge, dedupe, admit' },
] as const

const localAuditReport = runLocalAudit()

type ProductAuditWorkspaceProps = {
  inputUrl?: string
  stageDelayMs?: number
}

export function ProductAuditWorkspace({
  inputUrl = readInputUrl(),
  stageDelayMs = 680,
}: ProductAuditWorkspaceProps) {
  const [progress, setProgress] = useState(0)
  const complete = progress >= stages.length

  useEffect(() => {
    const timers = stages.map((_, index) => window.setTimeout(
      () => setProgress(index + 1),
      stageDelayMs * (index + 1),
    ))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [stageDelayMs])

  return (
    <main className="audit-workspace scanlines">
      <header className="audit-workspace-nav">
        <a href="/" aria-label="Back to CRRT landing"><Wordmark level="nav" /></a>
        <div className="audit-workspace-nav-meta">
          <span>LOCAL PREVIEW</span>
          <a href="/#audit">← Back to landing</a>
        </div>
      </header>

      <div className="audit-workspace-shell">
        <section className="audit-workspace-intro">
          <div>
            <span className="section-marker">/ product audit · audit-local-demo</span>
            <h1>Finding the CRRTs<br /><span>before your users do.</span></h1>
          </div>
          <div className="audit-target">
            <span>TARGET</span>
            <strong>{inputUrl}</strong>
            <small>Controlled fixture for {LOCAL_AUDIT_URL}</small>
          </div>
        </section>

        <div className="audit-workspace-grid">
          <aside className="audit-stage-rail" aria-label="Audit progress">
            <div className="audit-rail-label">AGENT TRACE</div>
            {stages.map((stage, index) => {
              const state = progress > index ? 'done' : progress === index ? 'active' : 'queued'
              return (
                <div className={`audit-stage audit-stage-${state}`} key={stage.name}>
                  <span className="audit-stage-node">{progress > index ? '✓' : `0${index + 1}`}</span>
                  <div>
                    <strong>{stage.name}</strong>
                    <span>{stage.detail}</span>
                  </div>
                  <small>{state}</small>
                </div>
              )
            })}

            <div className="audit-source-inventory">
              <div><span>URL</span><strong>evaluated</strong></div>
              <div><span>Repository</span><strong>not provided</strong></div>
              <div><span>Design system</span><strong>not provided</strong></div>
              <div><span>Customer rules</span><strong>not provided</strong></div>
            </div>
          </aside>

          <section className="audit-results" aria-live="polite">
            {!complete ? (
              <AuditRunning progress={progress} />
            ) : (
              <AuditComplete findings={localAuditReport.findings} />
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function readInputUrl() {
  if (typeof window === 'undefined') return LOCAL_AUDIT_URL
  return new URLSearchParams(window.location.search).get('url') ?? LOCAL_AUDIT_URL
}

function AuditRunning({ progress }: { progress: number }) {
  const activeStage = stages[Math.min(progress, stages.length - 1)]
  return (
    <div className="audit-running">
      <span className="audit-running-scan" aria-hidden>▰▰▰▱▱▱▱▱▱▱</span>
      <p>{activeStage.name.toUpperCase()}_IN_PROGRESS</p>
      <h2>{activeStage.detail}<span className="cursor-blink">_</span></h2>
      <small>Findings stay hidden until Verifier can defend them.</small>
    </div>
  )
}

function AuditComplete({ findings }: { findings: AuditFinding[] }) {
  return (
    <>
      <div className="audit-results-summary">
        <div>
          <span className="phosphor-eyebrow">audit complete</span>
          <h2>{findings.length} findings cleared the bar.</h2>
          <p>High impact. High confidence. Every claim links back to observable evidence.</p>
        </div>
        <div className="audit-score">
          <strong>{findings.length}</strong>
          <span>ADMITTED</span>
          <small>0 padded</small>
        </div>
      </div>

      <div className="audit-findings-list">
        {findings.map((finding, index) => (
          <article className="audit-finding" key={finding.id}>
            <div className="audit-finding-number">0{index + 1}</div>
            <div className="audit-finding-body">
              <div className="audit-finding-meta">
                <span>HIGH IMPACT</span>
                <span>{Math.round(finding.confidence * 100)}% CONFIDENCE</span>
                <span>{finding.status.toUpperCase()}</span>
              </div>
              <h3>{finding.title}</h3>
              <p>{finding.summary}</p>
              <div className="audit-evidence-list">
                {finding.evidence.map((evidence) => (
                  <div key={evidence.id}>
                    <span>↳ {evidence.location}</span>
                    <p>{evidence.observation}</p>
                  </div>
                ))}
              </div>
              <div className="audit-recommendation">
                <span>NEXT MOVE</span>
                <p>{finding.recommendation}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="audit-exhaustive-cta">
        <div>
          <span className="section-marker">Want the deeper pass?</span>
          <h3>Connect the repo + Design System.</h3>
          <p>Unlock code-level evidence, visual consistency checks, history, and multiplayer review.</p>
        </div>
        <PillButton
          variant="carrot"
          size="lg"
          onClick={() => { window.location.href = '/dashboard?intent=exhaustive-audit' }}
        >
          Get exhaustive report →
        </PillButton>
      </div>
    </>
  )
}
