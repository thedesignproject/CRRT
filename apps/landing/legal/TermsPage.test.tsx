import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TermsPage } from './TermsPage'

it('publishes the service terms, AI connection terms, and contact', () => {
  const initialTitle = document.title
  const view = render(<TermsPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'CRRT terms of service' })).toBeInTheDocument()
  expect(document.title).toBe('CRRT terms of service — CRRT')
  for (const heading of ['Using CRRT', 'Your content', 'AI assistant connections', 'Acceptable use', 'Plans and billing', 'Disclaimers and liability']) {
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
  }
  expect(screen.getByText(/limited to the permissions you approve/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
  expect(screen.getByRole('link', { name: 'hello@designproject.io' })).toHaveAttribute('href', 'mailto:hello@designproject.io')
  expect(screen.getAllByRole('link', { name: 'Terms' }).length).toBeGreaterThan(0)
  view.unmount()
  expect(document.title).toBe(initialTitle)
})
