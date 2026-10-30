import { Wordmark } from '../components/Wordmark'
import { DASHBOARD_HREF } from './Hero'

const CHROME_HREF = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '/support#extension'

const groups = [
  {
    label: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Install', href: '#install' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Integrations', href: '#integrations' },
    ],
  },
  {
    label: 'Get started',
    links: [
      { label: 'Open Dashboard', href: DASHBOARD_HREF },
      { label: 'Chrome extension', href: CHROME_HREF },
      { label: 'Self-host CRRT', href: '/docs/self-host' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Support', href: '/support' },
      { label: 'GitHub', href: 'https://github.com/thedesignproject/CRRT', external: true },
    ],
  },
] as const

export function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-main">
        <div className="landing-footer-brand">
          <Wordmark level="display" />
          <p>Visual feedback, structured for your coding agent.</p>
        </div>
        {groups.map((group) => (
          <nav key={group.label} aria-label={`${group.label} links`}>
            <span>{group.label}</span>
            {group.links.map((link) => (
              <a key={link.label} href={link.href} target={'external' in link && link.external ? '_blank' : undefined} rel={'external' in link && link.external ? 'noreferrer' : undefined}>{link.label}</a>
            ))}
          </nav>
        ))}
      </div>

      <div className="landing-footer-social">
        <div><span>Social</span><a href="https://github.com/thedesignproject/CRRT" target="_blank" rel="noreferrer" aria-label="CRRT on GitHub"><GitHubMark /></a></div>
        <p><i /> All systems operational</p>
      </div>

      <div className="landing-footer-legal">
        <span>© {new Date().getFullYear()} CRRT</span>
        <a href="/privacy">Privacy</a>
        <a href="/support">Support</a>
        <span>Made by <a href="https://designproject.io" target="_blank" rel="noreferrer">The Design Project</a></span>
      </div>
    </footer>
  )
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
      <path fill="currentColor" d="M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1.1.1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.4-5.5-6A4.7 4.7 0 0 1 6 8.2c-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.4 1.3a11.8 11.8 0 0 1 6.2 0c2.4-1.6 3.4-1.3 3.4-1.3.7 1.7.3 3 .1 3.3a4.7 4.7 0 0 1 1.3 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
    </svg>
  )
}
