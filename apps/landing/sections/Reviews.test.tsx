import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Reviews } from './Reviews'

afterEach(cleanup)

it('quotes what people say about CRRT verbatim, with who said it', () => {
  const { container } = render(<Reviews />)
  expect(screen.getByRole('region', { name: 'What people say about CRRT' })).not.toHaveAttribute('data-placeholder-content')
  expect(screen.getByRole('heading', { name: 'What people say about CRRT.' })).toBeInTheDocument()
  expect(screen.getByRole('figure')).toHaveTextContent('crrt is a very cool idea, the ice skating of feedback friction')
  expect(screen.getByRole('figure')).toHaveTextContent('@devonlamond')
  expect(container.querySelector('.voice-avatar')).toHaveTextContent('D')
  expect(container.querySelectorAll('.voices > li')).toHaveLength(1)
})
