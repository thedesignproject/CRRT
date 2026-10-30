import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ThemeProvider, preferredTheme, useTheme } from './theme'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Toggle() {
  const { theme, toggleTheme } = useTheme()
  return <button onClick={toggleTheme}>{theme}</button>
}

it('defaults the landing to light independently of system and dashboard preferences', () => {
  const values = new Map([['crrt-theme', 'dark'], ['dashboard-theme', 'dark']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const { unmount } = render(<ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light"><Toggle /></ThemeProvider>)
  expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument()
  expect(values.get('dashboard-theme')).toBe('dark')
  fireEvent.click(screen.getByRole('button'))
  expect(values.get('crrt-landing-theme')).toBe('dark')
  unmount()
  render(<ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light"><Toggle /></ThemeProvider>)
  expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument()
})

it('keeps the explicit default when storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') } })
  expect(preferredTheme('crrt-landing-theme', 'light')).toBe('light')
})
