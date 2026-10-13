import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

it.each([
  { dev: true, expected: 'http://localhost:5173' },
  { dev: false, expected: '/dashboard' },
])('uses the expected dashboard destination when DEV is $dev', async ({ dev, expected }) => {
  vi.stubEnv('DEV', dev)
  const { DASHBOARD_HREF } = await import('./Hero')

  expect(DASHBOARD_HREF).toBe(expected)
  vi.resetModules()
})

it('presents the agent-led promise, conversion action, and all feedback surfaces together', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const { Hero } = await import('./Hero')
  const { ThemeProvider } = await import('../../../src/design-system')
  render(<ThemeProvider><Hero authenticated={false} /></ThemeProvider>)

  const heroVideo = screen.getByLabelText('Close portrait of a person looking at a screen')
  expect(heroVideo).toHaveAttribute('src', '/crrt-hero.mp4')
  expect(heroVideo).toHaveAttribute('poster', '/crrt-hero-portrait.jpg')
  expect(heroVideo).toHaveProperty('muted', true)
  expect(heroVideo).toHaveAttribute('loop')
  expect(heroVideo).toHaveAttribute('playsinline')
  expect(heroVideo.closest('.landing-photo-stage')).not.toHaveClass('is-media-ready')
  fireEvent.canPlay(heroVideo)
  expect(heroVideo.closest('.landing-photo-stage')).toHaveClass('is-media-ready')
  expect(screen.getByRole('heading', { name: 'Pin a comment. Your coding agent ships the fix.' })).toBeInTheDocument()
  expect(screen.getByText(/CRRT turns visual feedback into agent-ready work/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute('href', 'http://localhost:5173')
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  expect(screen.getByText('This headline doesn’t explain the product yet.')).toBeInTheDocument()
  expect(screen.getByText('Can we make the primary action easier to find?')).toBeInTheDocument()
  expect(screen.getByText('The mobile crop should keep the face in focus.')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'CRRT feedback widget preview' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /hero story/i })).not.toBeInTheDocument()
})

it('reveals the hero poster without autoplay when reduced motion is preferred', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const { Hero } = await import('./Hero')
  const { ThemeProvider } = await import('../../../src/design-system')
  render(<ThemeProvider><Hero authenticated={false} /></ThemeProvider>)
  fireEvent.canPlay(screen.getByLabelText('Close portrait of a person looking at a screen'))
  expect(play).not.toHaveBeenCalled()
})

it('keeps the conversion navigation available after the intro', async () => {
  const { Navigation } = await import('./Hero')
  const { ThemeProvider } = await import('../../../src/design-system')
  render(<ThemeProvider><Navigation authenticated /></ThemeProvider>)

  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', 'http://localhost:5173')
  expect(screen.getByRole('link', { name: 'How to install' })).toHaveAttribute('href', '#install')
})
