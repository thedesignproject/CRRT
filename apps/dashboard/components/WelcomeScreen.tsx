import { asset } from '../lib/routes'

interface WelcomeScreenProps {
  /** Called when the user clicks the "create your first project" CTA. */
  onCreateProject: () => void
  onOpenExtensionComments: () => void
}

/**
 * Onboarding moment 1: shown to an authenticated user whose account has zero
 * projects AND who hasn't been onboarded before (see ONBOARDED_KEY). One CTA,
 * no welcome tour — the rest of the introduction happens through the rich
 * empty state that follows (moment 2).
 */
export function WelcomeScreen({ onCreateProject, onOpenExtensionComments }: WelcomeScreenProps) {
  return (
    <div
      className="scanlines"
      style={{
        minHeight: '100svh',
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'clamp(40px, 10vh, 120px)',
        paddingBottom: 'clamp(32px, 8vh, 80px)',
        paddingLeft: 'clamp(24px, 7vw, 32px)',
        paddingRight: 'clamp(24px, 7vw, 32px)',
      }}
    >
      {/* Section marker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 'clamp(28px, 6vh, 40px)',
          maxWidth: 480,
          width: '100%',
        }}
      >
        <span className="crrt-section-marker" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>/ 00 setup</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 12 }} />
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 15,
            letterSpacing: '0.08em',
            color: 'var(--crrt-phosphor)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--crrt-phosphor)',
              animation: 'crrt-pulse 2400ms ease-in-out infinite',
            }}
          />
          ready when you are
        </span>
      </div>

      {/* CRRT identity mark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'clamp(24px, 5vh, 36px)' }}>
        <img
          src={asset('crrt-isologo.png')}
          alt=""
          width={40}
          height={40}
          style={{
            imageRendering: 'pixelated',
            width: 'clamp(32px, 8vw, 40px)',
            height: 'clamp(32px, 8vw, 40px)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 'clamp(22px, 5.5vw, 26px)',
            letterSpacing: '0.06em',
            color: 'var(--foreground)',
          }}
        >
          CRRT.
        </span>
      </div>

      {/* Title with terminal cursor */}
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--crrt-font-mono)',
          fontWeight: 700,
          fontSize: 'clamp(28px, 8vw, 40px)',
          lineHeight: 1.15,
          letterSpacing: '-0.015em',
          color: 'var(--foreground)',
          textAlign: 'center',
          marginBottom: 14,
          textWrap: 'balance',
        }}
      >
        <span className="crrt-cursor">welcome to crrt</span>
      </h1>

      <p
        style={{
          margin: 0,
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 'clamp(15px, 3.6vw, 17px)',
          lineHeight: 1.55,
          color: 'var(--muted-foreground)',
          textAlign: 'center',
          marginBottom: 'clamp(28px, 6vh, 40px)',
          maxWidth: 480,
          textWrap: 'pretty',
        }}
      >
        drop visual feedback on any element of your product. triage. hand off to your AI agent. ship the fix.
      </p>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={onCreateProject}
        style={{
          height: 52,
          padding: '0 24px',
          background: 'var(--crrt-carrot)',
          color: 'var(--crrt-white)',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'var(--crrt-font-mono)',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 8px 16px rgba(232, 133, 61, 0.32), 0 1px 0 rgba(255, 255, 255, 0.12) inset',
          transition: 'transform 80ms ease, box-shadow 220ms ease',
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.985)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        ▸ create your first project
      </button>

      <button type="button" onClick={onOpenExtensionComments} style={{ marginTop: 14, border: 'none', background: 'transparent', color: 'var(--muted-foreground)', fontFamily: 'var(--crrt-font-body)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>view my extension comments →</button>

      {/* Secondary link to docs */}
      <a
        href="/docs/install"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          marginTop: 20,
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 13,
          color: 'var(--muted-foreground)',
          textDecoration: 'none',
          transition: 'color 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
      >
        learn more →
      </a>
    </div>
  )
}
