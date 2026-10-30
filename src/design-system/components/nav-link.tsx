import type { AnchorHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function NavLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('ds-nav-link', className)} {...props} />
}
