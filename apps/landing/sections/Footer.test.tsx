import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Footer } from './Footer'

it('keeps the resources library reachable from the footer', () => {
  render(<Footer />)
  const group = screen.getByRole('navigation', { name: 'Resources links' })
  const link = within(group).getByRole('link', { name: 'Guides & resources' })
  expect(link).toHaveAttribute('href', '/resources')
  expect(link).not.toHaveAttribute('target')
})
