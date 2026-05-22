import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { CarrotIcon } from '../components/CarrotIcon'
import { PIN_GRADIENT } from '@widget/components/FeedbackWidget/constants'

// In dev the dashboard runs on its own Vite port; in prod we route /dashboard
// from the landing deploy (see vercel.json rewrite — TODO when ready).
const DASHBOARD_HREF = import.meta.env.DEV ? 'http://localhost:5173' : '/dashboard'

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
          <a
            href="https://github.com/thedesignproject/CRRT"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a href="#install" className="hover:text-white transition-colors">Install</a>
          <PillButton variant="carrot" size="sm" withCarrot={false} onClick={() => { window.location.href = DASHBOARD_HREF }}>
            Sign up →
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
            position: 'relative',
            // Scroll-driven fade + blur (Apple-style). Values come from
            // useScrollProgress on document root.
            opacity: 'var(--hero-fade, 1)',
            filter: 'blur(var(--hero-blur, 0px))',
            willChange: 'opacity, filter',
          }}
        >
          <SplitWord text="CRRTs" delayStart={0} />{' '}
          <em
            className="crrt-glitch"
            style={{
              color: 'var(--crrt-carrot)',
              fontStyle: 'italic',
              display: 'inline-block',
              position: 'relative',
            }}
          >
            <SplitWord text="level" delayStart={360} italic />{' '}
            <SplitWord text="up" delayStart={720} italic />
          </em>{' '}
          <SplitWord text="your" delayStart={920} />{' '}
          <SplitWord text="product" delayStart={1120} />
          <span
            style={{
              display: 'inline-block',
              animation: 'crrt-power-on 600ms ease-out 1480ms both',
              transformOrigin: 'center',
            }}
          >
            .
          </span>
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
          Drop a CRRT on any element to leave visual feedback. Your team marks what's off, you ship the fix. Press{' '}
          <span style={{ position: 'relative', display: 'inline-block' }}>
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
            </kbd>
            <HeroDemoPin />
          </span>{' '}
          and try it on this page.
        </p>

        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8 }}>
          <PillButton
            variant="carrot"
            size="lg"
            onClick={() => document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Try the demo →
          </PillButton>
          <PillButton
            variant="ghost"
            size="lg"
            withCarrot={false}
            onClick={() => document.getElementById('install')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Install in 2 min
          </PillButton>
        </div>

        {/* Hint row */}
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 60, color: 'var(--crrt-ink-mute)', fontSize: 13, fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em' }}
        >
          <span
            style={{
              color: 'var(--crrt-phosphor)',
              display: 'inline-block',
              animation: 'crrt-pulse 2.4s ease-in-out infinite',
            }}
          >●</span>
          <span>scroll to keep playing — the widget follows you down</span>
        </div>
      </div>
    </section>
  )
}

function SplitWord({ text, delayStart, italic }: { text: string; delayStart: number; italic?: boolean }) {
  return (
    <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            fontStyle: italic ? 'italic' : 'normal',
            animation: `crrt-letter-rise 640ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delayStart + i * 45}ms both`,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

function HeroDemoPin() {
  // Open/close state — auto-show after the H1 has had time to land, then
  // auto-dismiss back into the pin. Hover keeps it open; leaving the pin
  // restarts the auto-dismiss timer. The pin itself stays as a persistent
  // invitation to re-explore.
  const [open, setOpen] = useState(false)
  const [hovering, setHovering] = useState(false)
  const autoShownRef = useRef(false)

  // First reveal: ~3.5s after page load.
  useEffect(() => {
    const t = window.setTimeout(() => {
      autoShownRef.current = true
      setOpen(true)
    }, 3700)
    return () => window.clearTimeout(t)
  }, [])

  // Auto-dismiss after 3.3s visible, unless the user is hovering.
  useEffect(() => {
    if (!open || hovering) return
    const t = window.setTimeout(() => setOpen(false), 3300)
    return () => window.clearTimeout(t)
  }, [open, hovering])

  return (
    <span
      aria-hidden
      onMouseEnter={() => {
        setHovering(true)
        setOpen(true)
      }}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: 'absolute',
        top: -10,
        right: -10,
        lineHeight: 1,
      }}
    >
      {/* Pin — drops after the H1 finishes animating in. */}
      <span
        style={{
          display: 'block',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: PIN_GRADIENT,
          outline: '2px solid #fff',
          outlineOffset: 1,
          boxShadow: [
            '0 0 0 1px rgba(255, 255, 255, 0.14)',
            '0 0 0 2px rgba(10, 10, 10, 0.55)',
            '0 0 12px rgba(232, 133, 61, 0.55)',
            '0 3px 8px rgba(10, 10, 10, 0.45)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          ].join(', '),
          animation: 'crrt-pin-drop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 3500ms both',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      />

      {/* Halo — gentle pulse to invite the hover */}
      <span
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: 16,
          height: 16,
          marginLeft: -8,
          marginTop: -8,
          borderRadius: '50%',
          background: 'rgba(232, 133, 61, 0.5)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: 'crrt-pin-seed-halo 2400ms ease-out 4100ms infinite',
          zIndex: -1,
        }}
      />

      {/* Popover — state-driven (initial reveal + hover). Floats above-right
          into the empty space past the description paragraph so it never
          covers the H1 or the description text. */}
      <span
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: -12,
          width: 220,
          background: 'rgba(18, 18, 18, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 12,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'block',
          transformOrigin: 'bottom left',
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.85) translateY(6px)',
          transition: 'opacity 240ms ease, transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--crrt-bg-deep)',
              border: '1px solid var(--crrt-rule-dark)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <CarrotIcon size={14} />
          </span>
          <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 12, fontWeight: 600, color: '#FFFFFF', letterSpacing: 0 }}>
            CRRT
          </span>
          <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 11, color: '#6B6560', fontWeight: 400, letterSpacing: 0 }}>
            just now
          </span>
        </span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#E8E5DF',
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          press{' '}
          <span
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'var(--crrt-bg-deep)',
              border: '1px solid var(--crrt-rule-dark)',
              color: 'var(--crrt-white)',
            }}
          >
            C
          </span>{' '}
          anywhere to drop one
        </span>
      </span>
    </span>
  )
}
