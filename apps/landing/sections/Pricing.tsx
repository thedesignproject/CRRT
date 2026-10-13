import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button, SectionIntro, SegmentedControl } from '../../../src/design-system'
import { cloudPlanStartUrl, startCloudCheckout, type BillingCycle, type CloudPlanKey } from '../lib/billing'

const plans = [
  {
    key: 'community', name: 'Self-hosted', monthly: 0, yearly: 0,
    description: 'The complete product on infrastructure you operate.',
    features: ['Unlimited projects and users', 'Unlimited comments and audits', 'Your infrastructure and data'],
  },
  {
    key: 'pro', name: 'Pro', monthly: 19, yearly: 192, recommended: true,
    description: 'For product teams that want CRRT running without infrastructure work.',
    features: ['10 projects · 10 internal users', '2,000 comments each month', '5 Product Audits each month', 'Unlimited guests', 'Dashboard and Chrome included'],
  },
  {
    key: 'studio', name: 'Studio', monthly: 49, yearly: 492,
    description: 'For studios and teams running several active products.',
    features: ['50 projects · 25 internal users', '10,000 comments each month', '30 Product Audits each month', 'Unlimited guests', 'Dashboard and Chrome included'],
  },
] as const

export function Pricing({ authenticated = false, accessToken, apiBase = '/api' }: { authenticated?: boolean; accessToken?: string; apiBase?: string }) {
  const [cycle, setCycle] = useState<BillingCycle>('yearly')
  const [busyPlan, setBusyPlan] = useState<CloudPlanKey | null>(null)
  const [error, setError] = useState('')

  async function checkout(plan: CloudPlanKey, token: string) {
    setBusyPlan(plan)
    setError('')
    try {
      window.location.assign(await startCloudCheckout(apiBase, token, plan, cycle))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cloud checkout is temporarily unavailable')
      setBusyPlan(null)
    }
  }

  return (
    <section id="pricing" className="landing-section landing-pricing">
      <SectionIntro
        title="Choose how CRRT runs."
        description="Self-host CRRT for free, or choose Cloud when you want it managed and ready for your team."
        aside={<SegmentedControl label="Billing cycle" value={cycle} onChange={setCycle} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly', note: 'Save 16%' }]} />}
      />
      <div className="landing-pricing-table">
        {plans.map((plan) => {
          const community = plan.key === 'community'
          const annual = cycle === 'yearly'
          const price = community ? '$0' : annual ? `$${plan.yearly / 12}` : `$${plan.monthly}`
          const recommended = 'recommended' in plan && plan.recommended
          const eyebrow = community ? 'Free forever' : plan.key === 'pro' ? 'For product teams' : 'For studios and agencies'
          return (
            <article key={plan.key} className={`landing-pricing-column ${recommended ? 'is-recommended' : ''}`}>
              <div className={`landing-pricing-band ${recommended ? 'is-visible' : ''}`}>{recommended ? 'Recommended' : null}</div>
              <div className="landing-pricing-heading">
                <span>{eyebrow}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </div>
              <div className="landing-pricing-price">
                <strong>{price}</strong>
                <span>{community ? 'forever' : '/ month'}</span>
              </div>
              <p className="landing-pricing-billing">{community ? 'Run it on your own infrastructure.' : annual ? `$${plan.yearly} billed yearly · save 16%` : 'Billed monthly. Cancel anytime.'}</p>
              <div className="landing-pricing-features">
                <p>{community ? 'Self-hosted includes:' : plan.key === 'pro' ? 'Everything needed to ship:' : 'More capacity for every team:'}</p>
                <ul>{plan.features.map((feature) => <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>)}</ul>
              </div>
              <div className="landing-pricing-action">
                {community ? (
                  <a className="ds-button ds-button-secondary ds-button-md landing-pricing-button" href="/docs/self-host">Read self-host guide</a>
                ) : authenticated && accessToken ? (
                  <Button tone={plan.key === 'pro' ? 'primary' : 'secondary'} className="landing-pricing-button" disabled={busyPlan !== null} onClick={() => { void checkout(plan.key, accessToken) }}>
                    {busyPlan === plan.key ? 'Opening secure checkout…' : 'Start 14-day trial'}
                  </Button>
                ) : (
                  <a className={`ds-button ${plan.key === 'pro' ? 'ds-button-primary' : 'ds-button-secondary'} ds-button-md landing-pricing-button`} href={cloudPlanStartUrl(apiBase, plan.key, cycle)}>Start 14-day trial</a>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <div className="landing-pricing-notes"><span>Cloud trials require a card. Cancel anytime.</span><span>Self-hosted is the only permanently free plan.</span></div>
      {error ? <p className="landing-pricing-error" role="alert" aria-live="polite">{error} <button type="button" onClick={() => setError('')}>Dismiss</button></p> : null}
    </section>
  )
}
