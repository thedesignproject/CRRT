import { useEffect, type ReactNode } from 'react'
import { Wordmark } from '../components/Wordmark'
import { Footer } from '../sections/Footer'

const linkStyle = {
  color: 'var(--crrt-white)',
  textDecorationColor: 'var(--crrt-carrot)',
  textUnderlineOffset: 4,
} as const

export function LegalLink({ children, href }: { children: ReactNode; href: string }) {
  return <a href={href} style={linkStyle}>{children}</a>
}

export function LegalLayout({
  children,
  description,
  marker,
  title,
}: {
  children: ReactNode
  description: string
  marker: string
  title: string
}) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} — CRRT`
    return () => { document.title = previousTitle }
  }, [title])

  return (
    <div className="scanlines" style={{ minHeight: '100vh', background: 'var(--crrt-bg-deep)', color: 'var(--crrt-white)' }}>
      <header
        style={{
          borderBottom: '1px solid var(--crrt-rule-dark)',
          background: 'color-mix(in oklab, var(--crrt-bg-deep) 92%, transparent)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <nav
          aria-label="CRRT legal navigation"
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 24,
            justifyContent: 'space-between',
            margin: '0 auto',
            maxWidth: 960,
            padding: '16px clamp(18px, 4vw, 32px)',
          }}
        >
          <a href="/" aria-label="CRRT home" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Wordmark level="nav" />
          </a>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontFamily: 'var(--crrt-font-mono)', fontSize: 12 }}>
            <a href="/privacy" style={linkStyle}>Privacy</a>
            <a href="/support" style={linkStyle}>Support</a>
            <a href="/docs/install" style={linkStyle}>Docs</a>
          </div>
        </nav>
      </header>

      <main style={{ margin: '0 auto', maxWidth: 960, padding: 'clamp(48px, 8vw, 88px) clamp(18px, 4vw, 32px) 96px' }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 12, marginBottom: 18 }}>
          <span className="section-marker">/ {marker}</span>
          <span aria-hidden="true" style={{ background: 'var(--crrt-rule-dark)', flex: 1, height: 1 }} />
        </div>
        <h1
          style={{
            color: 'var(--crrt-white)',
            fontFamily: 'var(--crrt-font-mono)',
            fontSize: 'clamp(34px, 7vw, 64px)',
            letterSpacing: '-0.045em',
            lineHeight: 1,
            margin: 0,
            maxWidth: 780,
            textWrap: 'balance',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: 'var(--crrt-ink-faint)',
            fontFamily: 'var(--crrt-font-body)',
            fontSize: 'clamp(17px, 2.5vw, 20px)',
            lineHeight: 1.55,
            margin: '20px 0 0',
            maxWidth: 720,
            textWrap: 'pretty',
          }}
        >
          {description}
        </p>
        <div
          style={{
            borderTop: '1px solid var(--crrt-rule-dark)',
            marginTop: 'clamp(40px, 7vw, 72px)',
            maxWidth: 760,
            paddingTop: 'clamp(32px, 5vw, 48px)',
          }}
        >
          {children}
        </div>
      </main>

      <Footer />
    </div>
  )
}
