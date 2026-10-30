import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'crrt-theme'
const LEGACY_DASHBOARD_KEY = 'dashboard-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function preferredTheme(storageKey = STORAGE_KEY, defaultTheme?: Theme): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = localStorage.getItem(storageKey) ?? (storageKey === STORAGE_KEY ? localStorage.getItem(LEGACY_DASHBOARD_KEY) : null)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage is optional; system preference remains a safe fallback.
  }
  return defaultTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff')
}

export function ThemeProvider({ children, storageKey = STORAGE_KEY, defaultTheme }: { children: ReactNode; storageKey?: string; defaultTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(() => preferredTheme(storageKey, defaultTheme))

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(storageKey, theme)
      if (storageKey === STORAGE_KEY) localStorage.setItem(LEGACY_DASHBOARD_KEY, theme)
    } catch {
      // Theme still works for the current page when storage is unavailable.
    }
  }, [theme, storageKey])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((current) => current === 'light' ? 'dark' : 'light'),
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
