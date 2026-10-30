import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Button } from './components/button'
import { SectionIntro } from './components/section-intro'
import { SegmentedControl } from './components/segmented-control'
import { cn } from './lib/cn'

afterEach(cleanup)

it('renders shared buttons with stable defaults and explicit variants', () => {
  render(<><Button>Continue</Button><Button tone="secondary" size="lg" className="extra">Compare</Button></>)
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('type', 'button')
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('ds-button-primary', 'ds-button-md')
  expect(screen.getByRole('button', { name: 'Compare' })).toHaveClass('ds-button-secondary', 'ds-button-lg', 'extra')
})

it('renders section guidance only when supplied', () => {
  const view = render(<SectionIntro title="Choose a plan" />)
  expect(screen.getByRole('heading', { name: 'Choose a plan' })).toBeInTheDocument()
  expect(view.container.querySelector('p')).toBeNull()
  view.rerender(<SectionIntro title="Choose a plan" description="Compare each option." aside={<span>Annual</span>} />)
  expect(screen.getByText('Compare each option.')).toBeInTheDocument()
  expect(screen.getByText('Annual')).toBeInTheDocument()
})

it('announces and changes a generic segmented selection', () => {
  const change = vi.fn()
  render(<SegmentedControl label="Billing cycle" value="monthly" onChange={change} className="billing-cycle" options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly', note: 'Save' }]} />)
  expect(screen.getByRole('group', { name: 'Billing cycle' })).toHaveClass('billing-cycle')
  expect(screen.getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: /Yearly/ }))
  expect(change).toHaveBeenCalledWith('yearly')
})

it('merges utility classes deterministically', () => {
  expect(cn('px-2', false, 'px-4')).toBe('px-4')
})
