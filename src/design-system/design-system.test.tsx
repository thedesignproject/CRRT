import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyTheme, Badge, componentMetadata, preferredTheme, PricingCard, ThemeProvider, ThemeToggle, useTheme } from '.'

let stored: Map<string, string>
beforeEach(() => {
  stored = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    clear: () => stored.clear(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('publishes complete agent-readable metadata for every primitive', () => {
  expect(componentMetadata).toHaveLength(11)
  for (const component of componentMetadata) {
    expect(component.name).toBeTruthy()
    expect(component.whenToUse.length).toBeGreaterThan(0)
    expect(component.whenNotToUse.length).toBeGreaterThan(0)
    expect(component.accessibility.length).toBeGreaterThan(0)
  }
})

it('persists theme changes and exposes the destination in the control name', () => {
  function CurrentTheme() {
    const { theme } = useTheme()
    return <output>{theme}</output>
  }

  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  render(<ThemeProvider><ThemeToggle /><CurrentTheme /></ThemeProvider>)
  expect(screen.getByText('light')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
  expect(screen.getByText('dark')).toBeInTheDocument()
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('crrt-theme')).toBe('dark')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(screen.getByText('light')).toBeInTheDocument()
})

it('restores a legacy theme and updates an existing browser theme color', () => {
  stored.set('dashboard-theme', 'dark')
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#fff">')
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
  expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0a0a0a')
  document.querySelector('meta[name="theme-color"]')?.remove()
})

it('falls back to system dark mode when storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
  expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
})

it('uses a safe server theme and tolerates a missing theme-color meta tag', () => {
  vi.stubGlobal('window', undefined)
  expect(preferredTheme()).toBe('light')
  vi.unstubAllGlobals()
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  expect(() => applyTheme('light')).not.toThrow()
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#000">')
  applyTheme('light')
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
  document.querySelector('meta[name="theme-color"]')?.remove()
})

it('fails clearly when a theme consumer is rendered without its provider', () => {
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => render(<ThemeToggle />)).toThrow('useTheme must be used inside ThemeProvider')
  warn.mockRestore()
})

it('renders badges and both pricing card states', () => {
  const { rerender } = render(
    <><Badge className="custom">Beta</Badge><PricingCard name="Pro" description="For teams" price="$19" suffix="/ month" action={<button>Start</button>}><span>One feature</span></PricingCard></>,
  )
  expect(screen.getByText('Beta')).toHaveClass('ds-badge', 'custom')
  expect(screen.getByRole('article')).not.toHaveClass('is-recommended')

  rerender(<PricingCard name="Pro" description="For teams" price="$19" suffix="/ month" recommended action={<button>Start</button>}><span>One feature</span></PricingCard>)
  expect(screen.getByRole('article')).toHaveClass('is-recommended')
  expect(screen.getByText('Recommended')).toBeInTheDocument()
})
