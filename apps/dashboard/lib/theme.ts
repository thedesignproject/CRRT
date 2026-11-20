export type DashboardTheme = 'light' | 'dark'

// Studio is dark-first. The old 'dashboard-theme' key was written on every load,
// so it can't tell a real light-mode choice from the old default; start fresh.
// ('crrt-theme' belongs to the landing site on the same origin.)
const THEME_KEY = 'crrt-dashboard-theme'
// The landing site still falls back to this key, so a stale dashboard value would keep
// choosing its theme. Remove it once we write the new key.
const LEGACY_THEME_KEY = 'dashboard-theme'

export function getDashboardTheme(): DashboardTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyDashboardTheme(theme: DashboardTheme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('light', theme === 'light')
  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.removeItem(LEGACY_THEME_KEY)
  } catch { /* Storage may be blocked. */ }
}
