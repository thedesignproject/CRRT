import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Badge } from './badge'

export function PricingCard({ name, description, price, suffix, recommended = false, children, action }: {
  name: string
  description: string
  price: string
  suffix: string
  recommended?: boolean
  children: ReactNode
  action: ReactNode
}) {
  return (
    <article className={cn('ds-pricing-card', recommended && 'is-recommended')}>
      <div className="ds-pricing-heading"><h3>{name}</h3>{recommended ? <Badge>Recommended</Badge> : null}</div>
      <div className="ds-pricing-price"><strong>{price}</strong><span>{suffix}</span></div>
      <p>{description}</p>
      <div className="ds-pricing-features">{children}</div>
      <div className="ds-pricing-action">{action}</div>
    </article>
  )
}
