import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FeedbackJourney } from '../sections/FeedbackJourney'
import { Hero } from '../sections/Hero'
import { ThemeProvider } from '../../../src/design-system'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('takes the hero CTA to the real demo before activating selection', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  const activate = vi.fn()
  window.addEventListener('crrt:activate', activate)
  render(<ThemeProvider><Hero authenticated={false} /><FeedbackJourney /></ThemeProvider>)
  fireEvent.click(screen.getByRole('link', { name: 'Try CRRT' }))
  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  expect(document.activeElement).toBe(document.getElementById('try-crrt'))
  expect(activate).not.toHaveBeenCalled()
  vi.advanceTimersByTime(0)
  expect(activate).toHaveBeenCalledOnce()
  window.removeEventListener('crrt:activate', activate)
})

it('keeps the anchor fallback if the demo module is unavailable', () => {
  render(<ThemeProvider><Hero authenticated={false} /></ThemeProvider>)
  const link = screen.getByRole('link', { name: 'Try CRRT' })
  expect(link).toHaveAttribute('href', '#try-crrt')
  fireEvent.click(link)
})
