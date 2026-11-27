import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BrainPage } from './BrainPage'

it('explains Brain without showing sample rules', () => {
  render(<BrainPage />)
  expect(screen.getByRole('heading', { name: 'Brain' })).toBeInTheDocument()
  expect(screen.getByText('The rules your agents follow in every project.')).toBeInTheDocument()
  expect(screen.getByText('No rules yet')).toBeInTheDocument()
  expect(screen.getByText("Writing rules isn't available yet.")).toBeInTheDocument()
  expect(screen.queryByRole('list')).toBeNull()
})
