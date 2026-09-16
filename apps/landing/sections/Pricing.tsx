import { PillButton } from '../components/PillButton'
import { activateCRRT } from '../lib/crrt'
import { useReveal } from '../lib/useReveal'

/**
 * Pricing — a single Free card. Removes the silent "how much?" objection
 * before the visitor hits the install. When paid tiers exist, add columns
 * here; the dark-soft card surface scales horizontally.
 */
export function Pricing() {
  const reveal = useReveal<HTMLDivElement>()
  return (
    <section
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '120px 32px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div ref={reveal.ref} className={`mx-auto ${reveal.className}`} style={{ maxWidth: 1120 }}>
        {/* Eyebrow */}
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 06 pricing</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span className="phosphor-eyebrow">no card. no signup.</span>
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: 'var(--crrt-font-mono)',
            fontWeight: 700,
            fontSize: 'var(--crrt-text-h2)',
            lineHeight: 'var(--crrt-leading-h2)',
            letterSpacing: 'var(--crrt-tracking-h2)',
            color: 'var(--crrt-white)',
            margin: '0 0 56px',
            maxWidth: 720,
          }}
        >
          Free while it's<br />
          <span style={{ color: 'var(--crrt-carrot)', fontStyle: 'italic' }}>growing.</span>
        </h2>

        {/* Single pricing card */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <article
            className="hover-lift"
            style={{
              background: 'var(--crrt-bg-deep-soft)',
              border: '1px solid var(--crrt-rule-dark)',
              borderRadius: 'var(--crrt-radius-2xl)',
              padding: '40px 36px',
              maxWidth: 420,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span
                style={{
                  fontFamily: 'var(--crrt-font-mono)',
                  fontSize: 48,
                  fontWeight: 700,
                  color: 'var(--crrt-white)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                $0
              </span>
              <span
                style={{
                  fontFamily: 'var(--crrt-font-crt)',
                  fontSize: 14,
                  color: 'var(--crrt-ink-faint)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                forever, while in beta
              </span>
            </div>

            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontFamily: 'var(--crrt-font-sans)',
                fontSize: 15,
                lineHeight: 1.55,
                color: 'var(--crrt-ink-faint)',
              }}
            >
              {[
                'Unlimited comments on any URL',
                'Drop-in widget, no auth required',
                'Approved pins → prompts for Claude / Codex',
                'Self-hosted backend if you want it',
              ].map((line) => (
                <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: 'var(--crrt-carrot)', flexShrink: 0 }}>✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: 8 }}>
              <PillButton variant="carrot" size="lg" onClick={activateCRRT}>
                Drop a CRRT →
              </PillButton>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
