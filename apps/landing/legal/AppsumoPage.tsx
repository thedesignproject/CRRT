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
  ['10', 'projects'],
  ['10', 'collaborators'],
  ['2,000', 'comments a month'],
  ['5', 'audits a month'],
] as const

/** The pixel carrot from the Studio CarrotMark, coloured by the scoped tokens. */
function CarrotMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true" className="studio-carrot">
      <rect x="4" y="0" width="1" height="2" fill="var(--leaf)" />
      <rect x="5" y="1" width="1" height="1" fill="var(--leaf)" />
      <rect x="3" y="2" width="3" height="2" fill="var(--carrot)" />
      <rect x="2" y="4" width="3" height="2" fill="var(--carrot)" />
      <rect x="1" y="6" width="2" height="1" fill="var(--carrot)" />
      <rect x="0" y="7" width="1" height="1" fill="var(--carrot)" />
    </svg>
  )
}

function DealCard() {
  return (
    <aside className="studio-card studio-deal" aria-labelledby="appsumo-deal-title">
      <div className="studio-deal-head">
        <h2 id="appsumo-deal-title">Cloud Pro</h2>
        <span className="studio-chip">Lifetime</span>
      </div>
      <dl>
        {LIMITS.map(([value, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>Shows as <span className="studio-mono">AppSumo lifetime · Cloud Pro</span> in Billing.</p>
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
            <CarrotMark />
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
