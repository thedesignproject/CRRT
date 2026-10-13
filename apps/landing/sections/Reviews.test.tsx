import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Reviews } from './Reviews'

it('renders the two-column testimonial preview with attribution', () => {
  render(<Reviews />)

  expect(screen.getByRole('region', { name: 'Customer reviews' })).toHaveAttribute('data-placeholder-content', 'true')
  expect(screen.getAllByRole('figure')).toHaveLength(2)
  expect(screen.getByText('Maya Chen')).toBeInTheDocument()
  expect(screen.getByText('Jon Bell')).toBeInTheDocument()
})
