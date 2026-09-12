export type DashboardTheme = 'light' | 'dark'

export function getDashboardTheme(): DashboardTheme {
  try {
    return localStorage.getItem('dashboard-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyDashboardTheme(theme: DashboardTheme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('light', theme === 'light')
  try { localStorage.setItem('dashboard-theme', theme) } catch { /* Storage may be blocked. */ }
}
