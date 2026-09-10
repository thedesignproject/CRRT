import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DocsApp } from './DocsApp'
it('keeps trailing-slash deep links and client navigation aligned with server documents', () => {
  window.history.replaceState({}, '', '/docs/agent-handoff/')
  render(<DocsApp initialPath="/docs/agent-handoff/" />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hand off feedback')
  expect(document.title).toContain('CRRT Agent API')
  fireEvent.click(screen.getAllByRole('link', { name: 'Self-host', exact: true })[0])
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Run your own CRRT.')
  expect(document.title).toContain('Self-host CRRT')
  window.history.pushState({}, '', '/docs/')
  fireEvent.popState(window)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Install')
})
