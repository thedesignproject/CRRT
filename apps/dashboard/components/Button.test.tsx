import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonClassName } from './Button'

describe('Button', () => {
  it('renders a small primary action button by default', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Create project</Button>)

    const button = screen.getByRole('button', { name: 'Create project' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('bg-primary', 'text-primary-foreground', 'h-7', 'text-xs', 'rounded-md')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps an explicit submit type and forwards refs', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref} type="submit" size="md" variant="secondary">Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBe(ref.current)
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveClass('h-8', 'border', 'border-border', 'bg-card')
  })

  it('maps each variant to its Figma tokens', () => {
    expect(buttonClassName()).toContain('bg-primary')
    expect(buttonClassName({ variant: 'ghost' })).toContain('text-muted-foreground')
    expect(buttonClassName({ variant: 'ghost' })).toContain('font-medium')
    expect(buttonClassName({ variant: 'destructive' })).toContain('bg-destructive')
    expect(buttonClassName({ variant: 'destructive' })).toContain('text-destructive-foreground')
    const link = buttonClassName({ variant: 'link', size: 'md' })
    expect(link).toContain('text-primary')
    expect(link).toContain('p-0')
    expect(link).not.toContain('h-8')
  })

  it('lets callers add classes', () => {
    expect(buttonClassName({ className: 'w-full' })).toContain('w-full')
  })

  it('disables a button action', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Delete</Button>)

    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders icons beside the label and hides them from assistive tech', () => {
    render(
      <Button leftIcon={<svg data-testid="left" />} rightIcon={<svg data-testid="right" />}>
        Copy key
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Copy key' })
    const left = screen.getByTestId('left').parentElement
    const right = screen.getByTestId('right').parentElement
    expect(left).toHaveAttribute('aria-hidden', 'true')
    expect(right).toHaveAttribute('aria-hidden', 'true')
    expect(button.firstChild).toBe(left)
    expect(button.lastChild).toBe(right)
  })

  it('renders a link when given href', () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault())
    render(<Button href="/dashboard/settings" variant="link" onClick={onClick}>View in dashboard</Button>)

    const link = screen.getByRole('link', { name: 'View in dashboard' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/dashboard/settings')
    expect(link).not.toHaveAttribute('aria-disabled')
    expect(link).not.toHaveAttribute('role')
    fireEvent.click(link)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('follows a link without an onClick handler', () => {
    render(<Button href="/docs">Read docs</Button>)

    const link = screen.getByRole('link', { name: 'Read docs' })
    expect(fireEvent.click(link)).toBe(true)
  })

  it('disables a link by removing its destination and blocking clicks', () => {
    const onClick = vi.fn()
    render(<Button href="/dashboard/billing" disabled onClick={onClick}>Open billing</Button>)

    const link = screen.getByRole('link', { name: 'Open billing' })
    expect(link).not.toHaveAttribute('href')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(fireEvent.click(link)).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })
})
