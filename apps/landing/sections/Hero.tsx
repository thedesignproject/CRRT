import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { activateCRRT } from '../lib/crrt'

export function Hero() {
  return (
    <section
      className="scanlines relative"
      style={{
        minHeight: '100svh',
        background: 'var(--crrt-bg-deep)',
        paddingBottom: 'var(--crrt-space-11)',
      }}
    >
      {/* Nav */}
      <nav
        className="flex items-center justify-between"
        style={{
          padding: '20px 32px',
          borderBottom: '1px solid var(--crrt-rule-dark)',
          position: 'sticky',
          top: 0,
          backdropFilter: 'blur(12px)',
          background: 'color-mix(in oklab, var(--crrt-bg-deep) 88%, transparent)',
          zIndex: 50,
        }}
      >
        <Wordmark level="nav" />
        <div className="flex items-center gap-6 text-[13px]" style={{ color: 'var(--crrt-ink-faint)' }}>
          <a href="#try" className="hover:text-white transition-colors">Try it</a>
          <a href="#install" className="hover:text-white transition-colors">Install</a>
          <PillButton variant="carrot" size="sm" withCarrot={false} onClick={activateCRRT}>
            Get started
          </PillButton>
        </div>
      </nav>

      {/* Body */}
      <div
        className="mx-auto"
        style={{
          maxWidth: 1120,
          padding: '120px 32px 0',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 32,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="section-marker">/ 01 hero</span>
          <span
            style={{
              width: 40,
              height: 1,
              background: 'var(--crrt-rule-dark)',
            }}
          />
          <span className="phosphor-eyebrow">try it on this page →</span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--crrt-font-mono)',
            fontWeight: 700,
            fontSize: 'var(--crrt-text-display)',
            lineHeight: 'var(--crrt-leading-display)',
            letterSpacing: 'var(--crrt-tracking-display)',
            color: 'var(--crrt-white)',
            margin: 0,
            maxWidth: 900,
          }}
        >
          This <em style={{ color: 'var(--crrt-carrot)', fontStyle: 'italic' }}>is</em> the demo.
        </h1>

        <p
          style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 18,
            lineHeight: 1.55,
            color: 'var(--crrt-ink-faint)',
            margin: 0,
            maxWidth: 620,
          }}
        >
          Press{' '}
          <kbd
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 13,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'var(--crrt-bg-deep-soft)',
              border: '1px solid var(--crrt-rule-dark)',
              color: 'var(--crrt-white)',
            }}
          >
            C
          </kbd>{' '}
          and drop a carrot anywhere on this page. That's exactly what your team will do in your product — point at the thing, leave a comment, move on.
        </p>

        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8 }}>
          <PillButton variant="carrot" size="lg" onClick={activateCRRT}>
            Drop your first carrot
          </PillButton>
          <PillButton variant="ghost" size="lg" withCarrot={false}>
            Install in 2 min
          </PillButton>
        </div>

        {/* Hint row */}
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 60, color: 'var(--crrt-ink-mute)', fontSize: 12, fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em' }}
        >
          <span style={{ color: 'var(--crrt-phosphor)' }}>●</span>
          <span>scroll to keep playing — the widget follows you down</span>
        </div>
      </div>
    </section>
  )
}
