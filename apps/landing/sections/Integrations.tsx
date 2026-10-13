import { ArrowRight, Check } from 'lucide-react'
import { DASHBOARD_HREF } from './Hero'

const integrations = [
  { name: 'GitHub', detail: 'Issue #184', status: 'Ready', Mark: GitHubMark },
  { name: 'Linear', detail: 'DES-42', status: 'Synced', Mark: LinearMark },
  { name: 'Jira', detail: 'WEB-219', status: 'Draft ready', Mark: JiraMark },
] as const

export function Integrations() {
  return (
    <section id="integrations" className="landing-section landing-integrations">
      <div className="landing-integrations-copy">
        <h2>One comment. One trackable next step.</h2>
        <p>Copy an implementation-ready prompt or create an individual GitHub, Linear, or Jira issue for every selected comment. No manual rewrite between feedback and code.</p>
        <a href={DASHBOARD_HREF}>Start with CRRT <ArrowRight size={18} /></a>
        <div className="landing-agent-support">
          <span>Agent handoff</span>
          <strong>Claude Code</strong>
          <strong>Codex</strong>
          <strong>Cursor</strong>
        </div>
      </div>

      <div className="landing-integrations-stage">
        <div className="landing-integrations-list">
          {integrations.map(({ name, detail, status, Mark }) => (
            <article key={name}>
              <i><Mark /></i>
              <div><strong>{name}</strong><span>{detail}</span></div>
              <b><Check size={13} /> {status}</b>
            </article>
          ))}
        </div>

        <div className="landing-integrations-rail" aria-hidden="true">
          <span /><span /><span />
          <i />
          <em />
        </div>

        <article className="landing-integrations-output">
          <header><span>CRRT.</span><b>Ready to send</b></header>
          <h3>Every issue arrives ready to act on.</h3>
          <ul>
            <li><Check size={14} /> Original comment</li>
            <li><Check size={14} /> Screenshot and selector</li>
            <li><Check size={14} /> Approved direction</li>
          </ul>
          <div className="landing-integration-action"><GitHubMark /><span>Create tracked issue</span><ArrowRight size={15} /></div>
          <div className="landing-integration-action"><span className="landing-integration-spark">✦</span><span>Hand off to your agent</span><ArrowRight size={15} /></div>
        </article>
      </div>
    </section>
  )
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1.1.1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.4-5.5-6A4.7 4.7 0 0 1 6 8.2c-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.4 1.3a11.8 11.8 0 0 1 6.2 0c2.4-1.6 3.4-1.3 3.4-1.3.7 1.7.3 3 .1 3.3a4.7 4.7 0 0 1 1.3 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
    </svg>
  )
}

function LinearMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.4 15.2 8.8 19.6A8.5 8.5 0 0 1 4.4 15.2Zm-.8-5.1 10.3 10.3a8.3 8.3 0 0 1-2 .1L3.5 12.1a8.3 8.3 0 0 1 .1-2Zm2-3.9 12.2 12.2a8.6 8.6 0 0 1-1.6 1.1L4.5 7.8a8.6 8.6 0 0 1 1.1-1.6ZM12 3.5a8.5 8.5 0 0 1 8.5 8.5c0 1.4-.3 2.8-1 4L8 4.5a8.5 8.5 0 0 1 4-1Z" />
    </svg>
  )
}

function JiraMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 4.6 4.6L12 11.2 7.4 6.6 12 2Zm0 7.2 4.6 4.6-4.6 4.6-4.6-4.6L12 9.2Zm0 7.2 2.8 2.8L12 22l-2.8-2.8 2.8-2.8Z" />
    </svg>
  )
}
