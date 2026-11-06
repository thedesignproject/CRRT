import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../../src/design-system/theme'
import { ResourcesMenu } from '../resources/ResourcesMenu'
import { Wordmark } from './Wordmark'

export const DASHBOARD_HREF = import.meta.env.DEV && !import.meta.env.SSR ? 'http://localhost:5173' : '/dashboard'

export function Navigation({ authenticated }: { authenticated: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'light' ? 'dark' : 'light'
  // These fixed semantic classes need no runtime Tailwind conflict resolution.
  return (
    <nav className="landing-navigation" aria-label="Main navigation">
      <a href="/#product" aria-label="CRRT home" className="landing-navigation-brand"><Wordmark level="nav" /></a>
      <div className="landing-navigation-links">
        <a className="ds-nav-link" href="/#how-it-works">How it works</a>
        <a className="ds-nav-link" href="/#pricing">Pricing</a>
        <ResourcesMenu />
        <a className="ds-nav-link" href="/docs">Docs</a>
        <a className="ds-nav-link" href="https://github.com/thedesignproject/CRRT">GitHub</a>
      </div>
      <div className="landing-navigation-actions">
        <button className="ds-icon-button" type="button" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={toggleTheme}>
          {theme === 'light' ? <Moon aria-hidden="true" size={17} /> : <Sun aria-hidden="true" size={17} />}
        </button>
        <a className="ds-button ds-button-primary ds-button-sm" href={DASHBOARD_HREF}>
          {authenticated ? 'Dashboard' : 'Get started'}
        </a>
      </div>
    </nav>
  )
}
