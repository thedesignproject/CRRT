import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AppsumoPage } from './AppsumoPage'

it('sends buyers to sign up or log in and straight back to the redeem field', () => {
  render(<AppsumoPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Redeem your AppSumo deal' })).toBeInTheDocument()
  expect(document.title).toBe('Redeem your AppSumo deal — CRRT')
  expect(screen.getByRole('link', { name: 'Create account and redeem' })).toHaveAttribute('href', expect.stringMatching(/\/billing\?appsumo=1&auth=signup$/))
  expect(screen.getByRole('link', { name: 'I have an account, log in' })).toHaveAttribute('href', expect.stringMatching(/\/billing\?appsumo=1$/))
  expect(screen.getByText(/Redeeming does not cancel a Stripe subscription/)).toBeInTheDocument()
  expect(screen.getByText(/10 projects, 10 collaborators, 2,000 comments and 5 audits/)).toBeInTheDocument()
})
