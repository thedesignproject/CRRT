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

it('hydrates server markup before restoring a saved dark preference', () => {
  const values = new Map([['crrt-landing-theme', 'dark']])
  const writes: string[] = []
  const seen: string[] = []
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(value); values.set(key, value) },
  })
  function Current() {
    const { theme } = useTheme()
    seen.push(theme)
    return <span>{theme}</span>
  }
  render(<ThemeProvider storageKey="crrt-landing-theme" defaultTheme="light" hydrate><Current /></ThemeProvider>)
  expect(seen[0]).toBe('light')
  expect(screen.getByText('dark')).toBeInTheDocument()
  expect(values.get('crrt-landing-theme')).toBe('dark')
  expect(writes).not.toContain('light')
})
