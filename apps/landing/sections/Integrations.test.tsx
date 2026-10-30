import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Integrations } from './Integrations'

afterEach(cleanup)
it('previews the chosen destination on hover, focus, and click', () => {
  render(<Integrations />)
  expect(screen.getByRole('heading', { name: 'Your Claude Code. With the full picture.' })).toBeInTheDocument()
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Preview Linear handoff' }))
  expect(screen.getByText('Create a Linear issue')).toBeInTheDocument()
  fireEvent.focus(screen.getByRole('button', { name: 'Preview Jira handoff' }))
  expect(screen.getByText('Create a Jira issue')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Preview GitHub handoff' }))
  expect(screen.getByText('Create a GitHub issue')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preview GitHub handoff' })).toHaveAttribute('aria-pressed', 'true')
})
