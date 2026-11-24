import { CTAGroup } from '../../../src/design-system'
import { DASHBOARD_HREF } from '../components/Navigation'
import { H2, Ol, P, Section, Strong } from '../docs/Prose'
import { LegalLayout, LegalLink } from './LegalLayout'

// Signed-out buyers sign up or log in, then land on the redeem field in Billing.
export const APPSUMO_REDEEM_HREF = `${DASHBOARD_HREF}/billing?appsumo=1`
export const APPSUMO_SIGNUP_HREF = `${APPSUMO_REDEEM_HREF}&auth=signup`

export function AppsumoPage() {
  return (
    <LegalLayout
      marker="appsumo"
      title="Redeem your AppSumo deal"
      description="Your AppSumo code unlocks CRRT Cloud Pro for life: 10 projects, 10 collaborators, 2,000 comments and 5 audits every month."
    >
      <CTAGroup>
        <a className="ds-button ds-button-primary ds-button-lg" href={APPSUMO_SIGNUP_HREF}>Create account and redeem</a>
        <a className="ds-button ds-button-secondary ds-button-lg" href={APPSUMO_REDEEM_HREF}>I have an account, log in</a>
      </CTAGroup>

      <Section>
        <H2>How to redeem</H2>
        <Ol>
          <li>Create a CRRT account, or log in if you already have one.</li>
          <li>You land on <Strong>Billing</Strong>. Paste your code into <Strong>Redeem AppSumo code</Strong> and choose <Strong>Redeem</Strong>.</li>
          <li>Your plan changes to <Strong>AppSumo lifetime · Cloud Pro</Strong> right away.</li>
        </Ol>
        <P>
          Each code works once, and each account can hold one code. Codes are case-sensitive, so paste them exactly as
          AppSumo shows them. Already signed in? Go to Billing and find the code field under your plan.
        </P>
      </Section>

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
