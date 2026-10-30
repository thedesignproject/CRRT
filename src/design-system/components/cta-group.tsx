import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function CTAGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ds-cta-group', className)} {...props} />
}
