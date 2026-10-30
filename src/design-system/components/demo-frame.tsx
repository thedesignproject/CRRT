import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Surface } from './surface'

export function DemoFrame({ title, status, controls, className, children, ...props }: HTMLAttributes<HTMLDivElement> & {
  title: string
  status?: string
  controls?: ReactNode
}) {
  return (
    <Surface className={cn('ds-demo-frame', className)} {...props}>
      <div className="ds-demo-toolbar">
        <span className="ds-demo-dots" aria-hidden="true"><i /><i /><i /></span>
        <strong>{title}</strong>
        <span>{status}</span>
        {controls}
      </div>
      <div className="ds-demo-content">{children}</div>
    </Surface>
  )
}
