import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDashboardTheme, getDashboardTheme } from './theme'

afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-theme'); document.documentElement.classList.remove('light') })
describe('dashboard theme', () => {
  it.each([null, '', 'invalid', 'light', 'dark'])('handles saved preference %s', (value) => {
    vi.stubGlobal('localStorage', { getItem: () => value, setItem: vi.fn() })
    expect(getDashboardTheme()).toBe(value === 'dark' ? 'dark' : 'light')
  })
  it.each(['light', 'dark'] as const)('applies and persists %s', (theme) => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    applyDashboardTheme(theme)
    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(document.documentElement.classList.contains('light')).toBe(theme === 'light')
    expect(setItem).toHaveBeenCalledWith('dashboard-theme', theme)
  })
  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') } })
    expect(getDashboardTheme()).toBe('light')
    expect(() => applyDashboardTheme('light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
