import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AppsumoPage } from './AppsumoPage'

it('sends buyers to sign up or log in and straight back to the redeem field', () => {
  render(<AppsumoPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Redeem your AppSumo deal' })).toBeInTheDocument()
  expect(document.title).toBe('Redeem your AppSumo deal — CRRT')
  expect(screen.getByRole('link', { name: 'Create account and redeem' })).toHaveAttribute('href', expect.stringMatching(/\/billing\?appsumo=1&auth=signup$/))
  expect(screen.getByRole('link', { name: 'I have an account, log in' })).toHaveAttribute('href', expect.stringMatching(/\/billing\?appsumo=1$/))
  expect(screen.getByRole('link', { name: 'Go to Billing' })).toHaveAttribute('href', expect.stringMatching(/\/billing\?appsumo=1$/))
  expect(screen.getByText(/Redeeming does not cancel a Stripe subscription/)).toBeInTheDocument()
  expect(screen.getByText(/10 projects, 10 collaborators, 2,000 comments and 5 audits/)).toBeInTheDocument()
})

it('summarises the lifetime plan and numbers the redeem steps', () => {
  render(<AppsumoPage />)
  const deal = screen.getByRole('complementary', { name: 'Cloud Pro' })
  expect(within(deal).getByText('Lifetime')).toBeInTheDocument()
  expect(within(deal).getByText('2,000').closest('div')).toHaveTextContent('comments a month2,000')
  expect(within(deal).getAllByRole('definition').map((value) => value.textContent)).toEqual(['10', '10', '2,000', '5'])
  const steps = within(screen.getByRole('list', { name: 'Redeem steps' })).getAllByRole('heading', { level: 3 })
  expect(steps.map((step) => step.textContent)).toEqual(['Create your account', 'Paste your code', 'Start using Pro'])
  expect(screen.getByRole('complementary', { name: 'Good to know' })).toHaveTextContent('Codes are case-sensitive')
})
