import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { CarrotIcon } from '../components/CarrotIcon'
import { activateCRRT } from '../lib/crrt'
import { PIN_GRADIENT } from '@widget/components/FeedbackWidget/constants'

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
            position: 'relative',
            // Scroll-driven fade + blur (Apple-style). Values come from
            // useScrollProgress on document root.
            opacity: 'var(--hero-fade, 1)',
            filter: 'blur(var(--hero-blur, 0px))',
            willChange: 'opacity, filter',
          }}
        >
          <SplitWord text="CRRTs" delayStart={0} />{' '}
          <span style={{ position: 'relative', display: 'inline-block' }}>
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
            </em>
            <HeroDemoPin />
          </span>{' '}
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
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: -6,
        right: -10,
        pointerEvents: 'none',
        // Inline-block + line-height reset so the absolute positioning sits
        // exactly at the corner of the italic span instead of the line box.
        lineHeight: 1,
      }}
    >
      {/* Pin — drops after a short beat */}
      <span
        style={{
          display: 'block',
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: PIN_GRADIENT,
          outline: '2px solid #fff',
          outlineOffset: 2,
          boxShadow: [
            '0 0 0 1px rgba(255, 255, 255, 0.14)',
            '0 0 0 2.5px rgba(10, 10, 10, 0.55)',
            '0 0 16px rgba(232, 133, 61, 0.55)',
            '0 4px 10px rgba(10, 10, 10, 0.45)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          ].join(', '),
          animation: 'crrt-pin-drop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 1500ms both',
        }}
      />

      {/* Halo */}
      <span
        style={{
          position: 'absolute',
          top: 11,
          left: 11,
          width: 22,
          height: 22,
          marginLeft: -11,
          marginTop: -11,
          borderRadius: '50%',
          background: 'rgba(232, 133, 61, 0.5)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          animation: 'crrt-pin-seed-halo 2400ms ease-out 2100ms infinite',
          zIndex: -1,
        }}
      />

      {/* Popover — expands from the pin, then stays visible */}
      <span
        style={{
          position: 'absolute',
          top: 32,
          left: -12,
          width: 280,
          background: 'rgba(18, 18, 18, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 12,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'block',
          transformOrigin: 'top left',
          animation: 'crrt-popover-expand 540ms cubic-bezier(0.34, 1.56, 0.64, 1) 1900ms both',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 22,
              height: 22,
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
            <CarrotIcon size={16} />
          </span>
          <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 13, fontWeight: 600, color: '#FFFFFF', letterSpacing: 0 }}>
            CRRT
          </span>
          <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 12, color: '#6B6560', fontWeight: 400, letterSpacing: 0, fontStyle: 'normal' }}>
            just now
          </span>
        </span>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 14,
            lineHeight: 1.5,
            color: '#E8E5DF',
            fontWeight: 400,
            letterSpacing: 0,
            fontStyle: 'normal',
          }}
        >
          meta: we just dropped this on our own H1. press{' '}
          <span
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 12,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--crrt-bg-deep)',
              border: '1px solid var(--crrt-rule-dark)',
              color: 'var(--crrt-white)',
            }}
          >
            C
          </span>{' '}
          to drop yours.
        </span>
      </span>
    </span>
  )
}
