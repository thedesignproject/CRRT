import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
vi.mock('./product-audit/ProductAuditWorkspace', () => ({ ProductAuditWorkspace: () => <div>Live audit workspace</div> }))
import { App } from './App'
it('routes durable audit IDs to the live workspace', () => {
  window.history.pushState({}, '', '/audit/11111111-1111-4111-8111-111111111111')
  render(<App />)
  expect(screen.getByText('Live audit workspace')).toBeInTheDocument()
})
