import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveDemo } from './LiveDemo'
import { Hero } from './Hero'
import { ThemeProvider } from '../../../src/design-system'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('takes the hero CTA to the real demo before activating selection', () => {
  vi.useFakeTimers()
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  const activate = vi.fn()
  window.addEventListener('crrt:activate', activate)
  render(<ThemeProvider><Hero authenticated={false} /><LiveDemo /></ThemeProvider>)
  fireEvent.click(screen.getByRole('link', { name: 'Try CRRT' }))
  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  expect(document.activeElement).toBe(document.getElementById('try-crrt'))
  expect(activate).not.toHaveBeenCalled()
  vi.runAllTimers()
  expect(activate).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Leave feedback' }))
  vi.runAllTimers()
  expect(activate).toHaveBeenCalledTimes(2)
  window.removeEventListener('crrt:activate', activate)
})

it('keeps the anchor fallback if the demo module is unavailable', () => {
  render(<ThemeProvider><Hero authenticated={false} /></ThemeProvider>)
  const link = screen.getByRole('link', { name: 'Try CRRT' })
  expect(link).toHaveAttribute('href', '#try-crrt')
  fireEvent.click(link)
})
