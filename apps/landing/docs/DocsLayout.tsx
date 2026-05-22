import { useEffect, useState, type ReactNode } from 'react'
import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'

const DASHBOARD_HREF = import.meta.env.DEV ? 'http://localhost:5173' : '/dashboard'

interface DocsLayoutProps {
  /** Current pathname, e.g. '/docs/install' — used to highlight the active page. */
  pathname: string
  /** Navigate to a new pathname without a full reload. */
  onNavigate: (path: string) => void
  /** Body of the page. */
  children: ReactNode
  /** Heading shown above the body. */
  title: string
  /** One-line description shown under the title. */
  description?: string
  /** Section marker shown above the title, e.g. 'install'. */
  marker: string
}

interface DocsLink {
  href: string
  label: string
  group?: 'guides' | 'reference'
}

const LINKS: DocsLink[] = [
  { href: '/docs/install', label: 'Install', group: 'guides' },
  { href: '/docs/agent-handoff', label: 'Agent handoff', group: 'guides' },
  { href: '/docs/self-host', label: 'Self-host', group: 'guides' },
]

export function DocsLayout({ pathname, onNavigate, children, title, description, marker }: DocsLayoutProps) {
  // Mobile sidebar drawer. Closes itself on route change.
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  function handleNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    // Allow cmd/ctrl/middle clicks to open in a new tab as normal.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onNavigate(href)
  }

  return (
    <div style={{ background: 'var(--crrt-bg-deep)', minHeight: '100vh', color: 'var(--crrt-white)' }}>
      {/* Top nav — mirrors the landing's nav so the brand stays continuous. */}
      <nav
        className="flex items-center justify-between"
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--crrt-rule-dark)',
          position: 'sticky',
          top: 0,
          backdropFilter: 'blur(12px)',
          background: 'color-mix(in oklab, var(--crrt-bg-deep) 90%, transparent)',
          zIndex: 30,
        }}
      >
        <a
          href="/"
          onClick={(e) => handleNav(e, '/')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}
        >
          <Wordmark level="nav" />
          <span
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 12,
              color: 'var(--crrt-ink-faint)',
              letterSpacing: '0.08em',
              textTransform: 'lowercase',
              borderLeft: '1px solid var(--crrt-rule-dark)',
              paddingLeft: 10,
            }}
          >
            docs
          </span>
        </a>

        <div className="flex items-center gap-3 sm:gap-6 text-[13px]" style={{ color: 'var(--crrt-ink-faint)' }}>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Toggle docs menu"
            aria-expanded={drawerOpen}
            className="sm:hidden"
            style={{
              background: 'transparent',
              border: '1px solid var(--crrt-rule-dark)',
              borderRadius: 6,
              padding: '6px 10px',
              color: 'var(--crrt-white)',
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {drawerOpen ? 'close' : 'menu'}
          </button>
          <a
            href="https://github.com/thedesignproject/CRRT"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors hidden sm:inline"
          >
            GitHub
          </a>
          <a
            href="/#install"
            onClick={(e) => handleNav(e, '/#install')}
            className="hover:text-white transition-colors hidden sm:inline"
          >
            Install
          </a>
          <PillButton
            variant="carrot"
            size="sm"
            withCarrot={false}
            onClick={() => {
              window.location.href = DASHBOARD_HREF
            }}
          >
            Sign up →
          </PillButton>
        </div>
      </nav>

      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: 'clamp(24px, 6vw, 48px) clamp(16px, 4vw, 32px) 96px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 32,
        }}
      >
        <div className="docs-grid">
          {/* Desktop sidebar */}
          <aside className="docs-sidebar-desktop">
            <SidebarNav pathname={pathname} onClick={handleNav} />
          </aside>

          {/* Mobile drawer (top-of-content, collapsible) */}
          {drawerOpen && (
            <div className="docs-sidebar-mobile">
              <SidebarNav pathname={pathname} onClick={handleNav} />
            </div>
          )}

          <main className="docs-main">
            <div style={{ marginBottom: 'clamp(28px, 5vw, 48px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className="section-marker" style={{ whiteSpace: 'nowrap' }}>/ docs / {marker}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--crrt-rule-dark)' }} />
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--crrt-font-mono)',
                  fontWeight: 700,
                  fontSize: 'clamp(28px, 5vw, 44px)',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: 'var(--crrt-white)',
                  textWrap: 'balance',
                }}
              >
                {title}
              </h1>
              {description && (
                <p
                  style={{
                    margin: '14px 0 0',
                    fontFamily: 'var(--crrt-font-body)',
                    fontSize: 'clamp(15px, 2.5vw, 18px)',
                    lineHeight: 1.55,
                    color: 'var(--crrt-ink-faint)',
                    maxWidth: 640,
                    textWrap: 'pretty',
                  }}
                >
                  {description}
                </p>
              )}
            </div>
            {children}
          </main>
        </div>
      </div>

      <style>{`
        .docs-grid {
          display: grid;
          gap: clamp(24px, 4vw, 56px);
        }
        @media (min-width: 880px) {
          .docs-grid {
            grid-template-columns: 220px minmax(0, 1fr);
          }
        }
        .docs-sidebar-desktop {
          display: none;
        }
        @media (min-width: 880px) {
          .docs-sidebar-desktop {
            display: block;
            position: sticky;
            top: 72px;
            align-self: start;
          }
        }
        .docs-sidebar-mobile {
          padding-bottom: 16px;
          border-bottom: 1px solid var(--crrt-rule-dark);
        }
        @media (min-width: 880px) {
          .docs-sidebar-mobile {
            display: none;
          }
        }
        .docs-main {
          min-width: 0;
          max-width: 720px;
        }
      `}</style>
    </div>
  )
}

function SidebarNav({
  pathname,
  onClick,
}: {
  pathname: string
  onClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}) {
  return (
    <nav aria-label="Docs">
      <p
        style={{
          margin: '0 0 12px',
          fontFamily: 'var(--crrt-font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--crrt-ink-mute)',
        }}
      >
        Guides
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {LINKS.map((link) => {
          const active = pathname === link.href
          return (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={(e) => onClick(e, link.href)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontFamily: 'var(--crrt-font-body)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--crrt-white)' : 'var(--crrt-ink-faint)',
                  background: active ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                  borderLeft: active ? '2px solid var(--crrt-carrot)' : '2px solid transparent',
                  textDecoration: 'none',
                  transition: 'background-color 120ms, color 120ms',
                }}
              >
                {link.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
