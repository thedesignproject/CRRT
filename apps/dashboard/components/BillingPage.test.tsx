import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
vi.mock('./BillingSettings', () => ({ BillingSettings: ({ apiBase, accessToken, checkoutState, initialPlan }: { apiBase: string; accessToken: string; checkoutState?: string; initialPlan?: string }) => <div>settings {apiBase} {accessToken} {checkoutState} {initialPlan}</div> }))
import { route } from '../lib/routes'
import { BillingPage } from './BillingPage'

it('renders the account shell with base-aware workspace navigation', () => {
  render(<BillingPage apiBase="/api" accessToken="token" email="owner@example.com" checkoutState="payload.signature" initialPlan="studio" />)
  expect(screen.getByRole('heading', { name: 'Billing & usage' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Workspace/ })).toHaveAttribute('href', route('/'))
  expect(screen.getByText('owner@example.com')).toBeInTheDocument()
  expect(screen.getByText('settings /api token payload.signature studio')).toBeInTheDocument()
})
