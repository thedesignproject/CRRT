import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ds-surface', className)} {...props} />
}
