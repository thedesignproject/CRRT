import '@fontsource/inter-tight/latin-400.css'
import '@fontsource/inter-tight/latin-500.css'
import '@fontsource/inter-tight/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import { useEffect } from 'react'
import studioTokens from '../../../packages/ui/src/tokens/tokens.css?raw'
import { DASHBOARD_HREF } from '../components/Navigation'
import './appsumo.css'

// Signed-out buyers sign up or log in, then land on the redeem field in Billing.
export const APPSUMO_REDEEM_HREF = `${DASHBOARD_HREF}/billing?appsumo=1`
export const APPSUMO_SIGNUP_HREF = `${APPSUMO_REDEEM_HREF}&auth=signup`

const TITLE = 'Redeem your AppSumo code'

/**
 * Studio tokens (packages/ui, the Storybook source) declare themselves on :root. The landing
 * owns :root, so this page applies them to its own wrapper instead.
 */
export function scopeTokens(css: string, scope: string) {
  return css.split('[data-theme="light"]').join(`${scope}[data-theme="light"]`).split(':root').join(scope)
}

const STUDIO_TOKENS = scopeTokens(studioTokens, '.studio-page')

const LIMITS = [
  { value: '10', label: 'Projects' },
  { value: '10', label: 'Collaborators' },
  { value: '2,000', label: 'Comments', unit: '/mo' },
  { value: '5', label: 'Audits', unit: '/mo' },
] as const

const INCLUDED = ['Every Cloud Pro feature', 'No card and no renewal']

function DealCard() {
  return (
    <aside className="studio-card studio-deal" aria-labelledby="appsumo-deal-title">
      <div className="studio-deal-head">
        <img src="/favicon.png" alt="" width={40} height={40} className="studio-logo" />
        <div>
          <h2 id="appsumo-deal-title">Cloud Pro</h2>
          <p className="studio-deal-sub">AppSumo lifetime deal</p>
        </div>
        <span className="studio-chip"><span aria-hidden="true" />Lifetime</span>
      </div>
      <dl>
        {LIMITS.map((limit) => (
          <div key={limit.label}>
            <dt>{limit.label}{'unit' in limit && <span className="studio-sr"> a month</span>}</dt>
            <dd>{limit.value}{'unit' in limit && <span className="studio-deal-unit" aria-hidden="true">{limit.unit}</span>}</dd>
          </div>
        ))}
      </dl>
      <ul className="studio-deal-included">
        {INCLUDED.map((item) => (
          <li key={item}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5 5.75 10 11 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {item}
          </li>
        ))}
      </ul>
      <p className="studio-deal-foot">Shows as <span className="studio-mono">AppSumo lifetime · Cloud Pro</span> in Billing.</p>
    </aside>
  )
}

/** A picture of the Billing field, so buyers know what to look for. Not a working form. */
function RedeemFieldPreview() {
  return (
    <div className="studio-field-preview" aria-hidden="true">
      <span className="studio-field-label">Redeem AppSumo code</span>
      <span className="studio-field-row">
        <span className="studio-field-input">Paste your code</span>
        <span className="studio-field-button">Redeem</span>
      </span>
    </div>
  )
}

const STEPS = [
  { title: 'Create your account', body: <>Sign up for CRRT, or log in if you already have an account.</> },
  { title: 'Paste your code', body: <>You land on <strong>Billing</strong>. Paste your code into <strong>Redeem AppSumo code</strong> and choose <strong>Redeem</strong>.</>, preview: true },
  { title: 'Start using Pro', body: <>Your plan changes to <strong>AppSumo lifetime · Cloud Pro</strong> right away.</> },
]

export function AppsumoPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${TITLE} — CRRT`
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div className="studio-page">
      <style dangerouslySetInnerHTML={{ __html: STUDIO_TOKENS }} />
      <header className="studio-header">
        <div className="studio-wrap studio-header-row">
          <a href="/" className="studio-brand" aria-label="CRRT home">
            <img src="/favicon.png" alt="" width={28} height={28} className="studio-logo" />
            <span>CRRT</span>
          </a>
          <nav aria-label="AppSumo page" className="studio-nav">
            <a href="/docs/install">Docs</a>
            <a href="/support">Support</a>
            <a className="studio-button studio-button-secondary studio-button-sm" href={APPSUMO_REDEEM_HREF}>Log in</a>
          </nav>
        </div>
      </header>

      <main className="studio-wrap">
        <section className="studio-hero" aria-labelledby="appsumo-title">
          <div>
            <p className="studio-eyebrow"><span aria-hidden="true" />AppSumo lifetime deal</p>
            <h1 id="appsumo-title">{TITLE}</h1>
            <p className="studio-lede">
              Your AppSumo code unlocks CRRT Cloud Pro for life: 10 projects, 10 collaborators, 2,000 comments and 5 audits every month.
            </p>
            <div className="studio-actions">
              <a className="studio-button studio-button-primary" href={APPSUMO_SIGNUP_HREF}>Create account and redeem</a>
              <a className="studio-button studio-button-secondary" href={APPSUMO_REDEEM_HREF}>I have an account, log in</a>
            </div>
            <p className="studio-meta">One code per account · No card needed</p>
          </div>
          <DealCard />
        </section>

        <section className="studio-section" aria-labelledby="appsumo-steps-title">
          <h2 id="appsumo-steps-title" className="studio-section-title">How to redeem</h2>
          <ol className="studio-steps" aria-label="Redeem steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="studio-card">
                <span className="studio-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {step.preview && <RedeemFieldPreview />}
              </li>
            ))}
          </ol>
        </section>

        <section className="studio-section studio-details" aria-label="Details">
          <aside className="studio-note" aria-labelledby="appsumo-note-title">
            <h3 id="appsumo-note-title">Good to know</h3>
            <ul>
              <li>Each code works once, and each account can hold one code.</li>
              <li>Codes are case-sensitive, so paste them exactly as AppSumo shows them.</li>
              <li>Already signed in? <a href={APPSUMO_REDEEM_HREF}>Go to Billing</a> and find the code field under your plan.</li>
            </ul>
          </aside>
          <div>
            <h3>Already paying with a card?</h3>
            <p>
              Redeeming does not cancel a Stripe subscription. Cancel it from <strong>Manage billing</strong> to stop future
              charges. Your AppSumo Pro access continues after it ends.
            </p>
          </div>
          <div>
            <h3>Need help?</h3>
            <p>
              If a code is rejected, check it for extra characters and try again. Still stuck? Visit{' '}
              <a href="/support">support</a> and include your AppSumo order email.
            </p>
          </div>
        </section>
      </main>

      <footer className="studio-footer">
        <div className="studio-wrap studio-footer-row">
          <span>© CRRT</span>
          <nav aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/support">Support</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
