import { DASHBOARD_HREF } from '../components/Navigation'
import { H2, P, Section, Strong } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

// Signed-out buyers sign up or log in, then land on the redeem field in Billing.
export const APPSUMO_REDEEM_HREF = `${DASHBOARD_HREF}/billing?appsumo=1`
export const APPSUMO_SIGNUP_HREF = `${APPSUMO_REDEEM_HREF}&auth=signup`

const LIMITS = [
  ['10', 'projects'],
  ['10', 'collaborators'],
  ['2,000', 'comments a month'],
  ['5', 'audits a month'],
] as const

function DealSummary() {
  return (
    <aside className="appsumo-deal" aria-labelledby="appsumo-deal-title">
      <div className="appsumo-deal-head">
        <h2 id="appsumo-deal-title">Cloud Pro</h2>
        <span>Lifetime</span>
      </div>
      <dl>
        {LIMITS.map(([value, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>One code, one account. No card needed to redeem.</p>
    </aside>
  )
}

export function AppsumoPage() {
  return (
    <LegalLayout
      marker="appsumo"
      title="Redeem your AppSumo deal"
      description="Your AppSumo code unlocks CRRT Cloud Pro for life: 10 projects, 10 collaborators, 2,000 comments and 5 audits every month."
      actions={(
        <>
          <a className="ds-button ds-button-primary ds-button-lg" href={APPSUMO_SIGNUP_HREF}>Create account and redeem</a>
          <a className="ds-button ds-button-secondary ds-button-lg" href={APPSUMO_REDEEM_HREF}>I have an account, log in</a>
        </>
      )}
      aside={<DealSummary />}
    >
      <Section>
        <H2>How to redeem</H2>
        <ol className="appsumo-steps" aria-label="Redeem steps">
          <li>
            <div>
              <h3>Create your account</h3>
              <p>Sign up for CRRT, or log in if you already have an account.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Paste your code</h3>
              <p>You land on <strong>Billing</strong>. Paste your code into <strong>Redeem AppSumo code</strong> and choose <strong>Redeem</strong>.</p>
            </div>
          </li>
          <li>
            <div>
              <h3>Start using Pro</h3>
              <p>Your plan changes to <strong>AppSumo lifetime · Cloud Pro</strong> right away.</p>
            </div>
          </li>
        </ol>
      </Section>

      <aside className="appsumo-note" aria-labelledby="appsumo-note-title">
        <h3 id="appsumo-note-title">Good to know</h3>
        <ul>
          <li>Each code works once, and each account can hold one code.</li>
          <li>Codes are case-sensitive, so paste them exactly as AppSumo shows them.</li>
          <li>Already signed in? <a href={APPSUMO_REDEEM_HREF}>Go to Billing</a> and find the code field under your plan.</li>
        </ul>
      </aside>

      <Section>
        <H2>Already paying with a card?</H2>
        <P>
          Redeeming does not cancel a Stripe subscription. Cancel it from <Strong>Manage billing</Strong> to stop
          future charges. Your AppSumo Pro access continues after it ends.
        </P>
      </Section>

      <Section>
        <H2>Need help?</H2>
        <P>
          If a code is rejected, check it for extra characters and try again. Still stuck? Visit{' '}
          <LegalLink href="/support">support</LegalLink> and include your AppSumo order email.
        </P>
      </Section>
    </LegalLayout>
  )
}
