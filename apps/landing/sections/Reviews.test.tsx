import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Reviews } from './Reviews'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('renders the carousel testimonial preview with attribution', () => {
  render(<Reviews />)

  expect(screen.getByRole('region', { name: 'Customer reviews' })).toHaveAttribute('data-placeholder-content', 'true')
  expect(screen.getByRole('heading', { name: 'Less translation. More shipped fixes.' })).toBeInTheDocument()
  expect(screen.getAllByRole('figure')).toHaveLength(2)
  expect(screen.getByText('Maya Chen')).toBeInTheDocument()
  expect(screen.getByText('Jon Bell')).toBeInTheDocument()
})

it('moves the carousel in either direction and respects reduced motion', () => {
  const media = vi.fn().mockReturnValue({ matches: false })
  vi.stubGlobal('matchMedia', media)
  render(<Reviews />)
  const track = screen.getByRole('group', { name: 'Customer review carousel' })
  Object.defineProperty(track, 'clientWidth', { value: 1000 })
  track.scrollBy = vi.fn()
  fireEvent.click(screen.getByRole('button', { name: 'Next review' }))
  expect(track.scrollBy).toHaveBeenLastCalledWith({ left: 720, behavior: 'smooth' })
  media.mockReturnValue({ matches: true })
  fireEvent.click(screen.getByRole('button', { name: 'Previous review' }))
  expect(track.scrollBy).toHaveBeenLastCalledWith({ left: -720, behavior: 'instant' })
})
