import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { ISOLOGO, activateCRRT } from '../lib/crrt'

const STATS = [
  { value: '< 2 min', label: 'to install' },
  { value: 'zero drift', label: 'pins anchor to elements' },
  { value: '100%', label: 'browser-native' },
  { value: 'AI-ready', label: 'approve → agent queue' },
]

export function Hero() {
  return (
    <section
      className="scanlines relative"
      style={{ background: 'var(--crrt-bg-deep)' }}
    >
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60,
        borderBottom: '1px solid var(--crrt-rule-dark)',
        position: 'sticky', top: 0,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        background: 'color-mix(in oklab, var(--crrt-bg-deep) 90%, transparent)',
        zIndex: 50,
      }}>
        <Wordmark level="nav" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <NavLink href="#try">Demo</NavLink>
          <NavLink href="#install">Install</NavLink>
          <PillButton variant="carrot" size="sm" withCarrot={false} onClick={activateCRRT}>Get started</PillButton>
        </div>
      </nav>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '80px 32px 88px' }}>

        {/* 2-col: text left, isologo right */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `1fr clamp(160px, 20vw, 240px)`,
          gap: 64,
          alignItems: 'center',
          marginBottom: 72,
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '6px 14px 6px 6px',
              borderRadius: 10,
              background: 'var(--crrt-bg-deep-soft)',
              border: '1px solid var(--crrt-rule-dark)',
              marginBottom: 40,
            }}>
              <img
                src={ISOLOGO}
                alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
              />
              <span style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 20, letterSpacing: '0.04em', lineHeight: 1 }}>
                <span style={{ color: 'var(--crrt-carrot)' }}>CRRT.</span>
                {' '}
                <span style={{ color: 'var(--crrt-ink-faint)' }}>feedback widget</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#28C840', boxShadow: '0 0 6px #28C840',
                  display: 'inline-block',
                }} />
                <span style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 14, color: 'var(--crrt-ink-mute)', letterSpacing: '0.06em' }}>
                  active
                </span>
              </span>
            </div>

            <h1 style={{
              fontFamily: 'var(--crrt-font-sans)',
              fontWeight: 700,
              fontSize: 'clamp(36px, 5.5vw, 68px)',
              lineHeight: 1.05,
              letterSpacing: '-0.028em',
              color: 'var(--crrt-white)',
              margin: '0 0 24px',
            }}>
              Carrots level up<br />
              <span style={{ color: 'var(--crrt-carrot)' }}>your product</span>
              <span className="cursor-blink" style={{ fontFamily: 'var(--crrt-font-crt)', color: 'var(--crrt-carrot)' }}>_</span>
            </h1>

            <p style={{
              fontFamily: 'var(--crrt-font-sans)',
              fontSize: 16, lineHeight: 1.65,
              color: 'var(--crrt-ink-faint)',
              margin: '0 0 44px', maxWidth: 500,
              letterSpacing: '-0.007em',
            }}>
              Every piece of feedback is a power-up. Drop a carrot on the exact element.
              Approve it. Your agent gets the context. Ship.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <PillButton variant="carrot" size="lg" onClick={activateCRRT}>Drop a carrot</PillButton>
              <PillButton variant="ghost" size="lg" withCarrot={false}>Install in 2 min</PillButton>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <img
              src={ISOLOGO}
              alt="CRRT isologo"
              style={{
                width: 'clamp(140px, 20vw, 220px)',
                height: 'clamp(140px, 20vw, 220px)',
                borderRadius: '50%',
                display: 'block',
                boxShadow: '0 24px 64px rgba(10,10,10,0.6), 0 4px 16px rgba(232,133,61,0.06)',
              }}
            />
            <div style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 22, letterSpacing: '0.1em', color: 'var(--crrt-carrot)' }}>
              CRRT.
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          borderTop: '1px solid var(--crrt-rule-dark)',
          paddingTop: 36,
        }}>
          {STATS.map((stat, i, arr) => (
            <div key={stat.value} style={{
              paddingLeft: i > 0 ? 28 : 0,
              paddingRight: i < arr.length - 1 ? 28 : 0,
              borderLeft: i > 0 ? '1px solid var(--crrt-rule-dark)' : 'none',
            }}>
              <div style={{
                fontFamily: 'var(--crrt-font-sans)', fontWeight: 700,
                fontSize: 'clamp(18px, 2.4vw, 28px)',
                color: 'var(--crrt-white)',
                letterSpacing: '-0.025em',
                lineHeight: 1, marginBottom: 6,
              }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--crrt-ink-mute)', fontFamily: 'var(--crrt-font-sans)', letterSpacing: '-0.005em' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      fontFamily: 'var(--crrt-font-sans)', fontSize: 13, fontWeight: 500,
      color: 'var(--crrt-ink-faint)', textDecoration: 'none',
      letterSpacing: '-0.005em', transition: 'color 150ms',
    }}
    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
    onMouseLeave={e => (e.currentTarget.style.color = 'var(--crrt-ink-faint)')}>
      {children}
    </a>
  )
}
