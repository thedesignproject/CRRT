import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, tone = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn('ds-button', `ds-button-${tone}`, `ds-button-${size}`, className)} {...props} />
})

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} aria-label={label} title={label} className={cn('ds-icon-button', className)} {...props} />
})
