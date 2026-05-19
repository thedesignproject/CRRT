import { Wordmark } from '../components/Wordmark'

/**
 * Page footer — nav row + big wordmark + micro tagline. Lives at the bottom
 * of the page regardless of the install/pricing order above it.
 */
export function Footer() {
  return (
    <footer
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '64px 32px 48px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 40 }}>
        <nav
          style={{
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 14,
          }}
        >
          {[
            { label: 'GitHub', href: 'https://github.com/thedesignproject/feedback-widget', external: true },
            { label: 'Docs', href: '#install' },
            { label: 'Status', href: 'https://github.com/thedesignproject/feedback-widget/issues', external: true },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noreferrer' : undefined}
              style={{
                color: 'var(--crrt-white)',
                textDecoration: 'none',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--crrt-carrot)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--crrt-white)')}
            >
              {link.label}
            </a>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--crrt-ink-mute)' }}>
            Made by{' '}
            <a
              href="https://designproject.io"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--crrt-ink-faint)', textDecoration: 'none', borderBottom: '1px solid var(--crrt-rule-dark)' }}
            >
              The Design Project
            </a>
          </span>
        </nav>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 24,
            paddingTop: 24,
            borderTop: '1px solid var(--crrt-rule-dark)',
          }}
        >
          <Wordmark level="display" />
          <span
            style={{
              fontSize: 13,
              color: 'var(--crrt-ink-mute)',
              fontFamily: 'var(--crrt-font-crt)',
              letterSpacing: '0.08em',
            }}
          >
            every CRRT is a <span style={{ color: 'var(--crrt-carrot)' }}>+1.</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
