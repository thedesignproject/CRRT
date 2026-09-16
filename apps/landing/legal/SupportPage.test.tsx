import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SupportPage } from './SupportPage'

it('documents installation, collaboration, recovery, and deletion paths', () => {
  render(<SupportPage />)

  expect(screen.getByRole('heading', { level: 1, name: 'CRRT support' })).toBeInTheDocument()
  expect(screen.getByText(/Install CRRT in Chrome and pin it to the toolbar/)).toBeInTheDocument()
  expect(screen.getByText(/Chrome does not allow extensions to inject into browser settings/)).toBeInTheDocument()
  expect(screen.getByText(/project owner or admin invites you by email/)).toBeInTheDocument()
  expect(screen.getByText(/Guests can create and view shared feedback/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'GitHub, Linear, or Jira needs attention' })).toBeInTheDocument()
  expect(screen.getByText(/failed tracker send does not delete the original feedback/)).toBeInTheDocument()
  expect(screen.getByText(/Delete feedback you own from the on-page CRRT surface/)).toBeInTheDocument()

  expect(screen.getByRole('link', { name: 'hello@designproject.io' })).toHaveAttribute(
    'href',
    'mailto:hello@designproject.io',
  )
  expect(screen.getByRole('link', { name: 'CRRT privacy policy' })).toHaveAttribute('href', '/privacy')
})
