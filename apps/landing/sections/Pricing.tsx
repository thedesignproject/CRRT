import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck } from 'lucide-react'
import { Button } from '../../../src/design-system/components/button'
import { SegmentedControl } from '../../../src/design-system/components/segmented-control'
import { cloudPlanStartUrl, startCloudCheckout, type BillingCycle, type CloudPlanKey } from '../lib/billing'
import './pricing.css'

const plans = [
  {
    key: 'community', name: 'Self-hosted', monthly: 0, yearly: 0,
    description: 'Your infrastructure. Your data.',
    features: ['Unlimited projects and users', 'Unlimited comments and audits', 'Your infrastructure and data'],
  },
  {
    key: 'pro', name: 'Pro', monthly: 19, yearly: 192, recommended: true,
    description: 'For teams turning feedback into fixes.',
    features: ['Private projects · 10 internal collaborators', 'Storybook review and component context', 'MCP connection and agent handoff', 'GitHub, Linear, and Jira integrations', 'Record agent handoff · private preview', '2,000 comments · 5 Product Audits / month', 'Unlimited guests'],
  },
  {
    key: 'studio', name: 'Studio', monthly: 49, yearly: 492, includes: 'Pro',
    description: 'For agencies managing multiple client projects.',
    features: ['50 projects · 25 internal collaborators', '10,000 comments / month', '30 Product Audits / month', 'Unlimited guests'],
  },
] as const

export function Pricing({ authenticated = false, accessToken, apiBase = '/api' }: { authenticated?: boolean; accessToken?: string; apiBase?: string }) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [busyPlan, setBusyPlan] = useState<CloudPlanKey | null>(null)
  const [error, setError] = useState('')
  const checkoutRef = useRef(false)
  const lifetime = useRef(0)

  useEffect(() => {
    lifetime.current += 1
    checkoutRef.current = false
    setBusyPlan(null)
    setError('')
    return () => { lifetime.current += 1 }
  }, [authenticated, accessToken, apiBase])

  async function checkout(plan: CloudPlanKey, token: string) {
    if (checkoutRef.current) return
    const request = lifetime.current
    checkoutRef.current = true
    setBusyPlan(plan)
    setError('')
    try {
      const destination = await startCloudCheckout(apiBase, token, plan, cycle)
      if (request !== lifetime.current) return
      window.location.assign(destination)
    } catch (reason) {
      if (request !== lifetime.current) return
      setError(reason instanceof Error ? reason.message : 'Cloud checkout is temporarily unavailable')
      setBusyPlan(null)
      checkoutRef.current = false
    }
  }

  const annual = cycle === 'yearly'
  return (
    <section id="pricing" className="landing-section landing-pricing">
      <header className="plan-intro">
        <h2>Choose how CRRT runs.</h2>
        <p>Self-host CRRT for free, or choose Cloud when you want it managed and ready for your team. Cloud plans start with a 14-day trial.</p>
        <SegmentedControl label="Billing cycle" value={cycle} onChange={setCycle} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly', note: 'Save 16%' }]} />
      </header>
      <div className="plan-grid">
        {plans.map((plan) => {
          const community = plan.key === 'community'
          const recommended = 'recommended' in plan
          const price = annual ? plan.yearly / 12 : plan.monthly
          return (
            <article key={plan.key} className={`plan${recommended ? ' is-recommended' : ''}`}>
              {recommended ? <p className="plan-flag">Recommended</p> : null}
              <h3>{plan.name}</h3>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price">
                <strong><sup>$</sup>{price}</strong>
                <span>{community ? <>Free forever<small>Runs on your infrastructure</small></> : <>Per month<small>{annual ? `Billed yearly at $${plan.yearly}` : 'Billed monthly'}</small></>}</span>
              </div>
              {community ? (
                <a className="ds-button ds-button-secondary ds-button-md plan-button" href="/docs/self-host">Read self-host guide</a>
              ) : authenticated && accessToken ? (
                <Button tone={recommended ? 'primary' : 'secondary'} className="plan-button" disabled={busyPlan !== null} onClick={() => { void checkout(plan.key, accessToken) }}>
                  {busyPlan === plan.key ? 'Opening secure checkout…' : 'Start 14-day trial'}
                </Button>
              ) : (
                <a className={`ds-button ${recommended ? 'ds-button-primary' : 'ds-button-secondary'} ds-button-md plan-button`} href={cloudPlanStartUrl(apiBase, plan.key, cycle)}>Start 14-day trial</a>
              )}
              <small className="plan-fine-print">{community ? 'Free forever. Your infrastructure.' : 'Card required · cancel anytime'}</small>
              <ul className="plan-features">
                {'includes' in plan ? <li className="plan-includes"><CheckCheck size={18} aria-hidden="true" />Everything in {plan.includes}</li> : null}
                {plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}
              </ul>
              {!community && <small className="plan-fine-print plan-record-note">Record preview: capture & transcription free; agent access requires sign-in.</small>}
            </article>
          )
        })}
      </div>
      {error ? <p className="plan-error" role="alert" aria-live="polite">{error} <button type="button" onClick={() => setError('')}>Dismiss</button></p> : null}
    </section>
  )
}
