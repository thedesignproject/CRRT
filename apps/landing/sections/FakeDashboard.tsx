import { useEffect, useState } from 'react'
import { useReveal } from '../lib/useReveal'
import { PIN_GRADIENT } from '@widget/components/FeedbackWidget/constants'

type DemoCommentData = {
  initials: string
  author: string
  time: string
  avatarColor: string
  body: string
}

// Two rotating feeds — each popover cycles through team-review style comments
// so the demo feels alive instead of static. Avatars and timestamps shift to
// reinforce the "real team commenting" vibe.
const VISITORS_COMMENTS: DemoCommentData[] = [
  { initials: 'L', author: 'Lucía F.', time: '9 min ago',  avatarColor: '#E8853D', body: 'Could the +12.4% delta match the value size? Hierarchy reads a bit flat.' },
  { initials: 'D', author: 'Diego M.', time: 'just now',   avatarColor: '#1F3A2F', body: '"Visitors" is too generic. Try "Sessions" or "Active users"?' },
  { initials: 'A', author: 'Ana C.',   time: '3 min ago',  avatarColor: '#B85F1F', body: 'Love the trend arrow. A sparkline below the number would seal it.' },
]

const CHART_COMMENTS: DemoCommentData[] = [
  { initials: 'T', author: 'Tomás B.', time: '22 min ago', avatarColor: '#1F3A2F', body: 'Worth labelling the chart peaks? Hard to tell which week is which.' },
  { initials: 'E', author: 'Emma K.',  time: '5 min ago',  avatarColor: '#E8853D', body: 'A tooltip on hover with exact numbers would close the loop here.' },
  { initials: 'J', author: 'Joaquín P.', time: '1 min ago', avatarColor: '#FFB000', body: 'Filter by source — marketing wants organic vs paid side by side.' },
]

export function FakeDashboard() {
  const reveal = useReveal<HTMLDivElement>()
  return (
    <section
      id="try"
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        padding: '120px 32px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div ref={reveal.ref} className={`mx-auto ${reveal.className}`} style={{ maxWidth: 1120 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 03 try it</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 18, letterSpacing: '0.08em', color: 'var(--crrt-ink-faint)' }}>
            a fake product to comment on
          </span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--crrt-font-mono)',
            fontWeight: 700,
            fontSize: 'var(--crrt-text-h2)',
            lineHeight: 'var(--crrt-leading-h2)',
            letterSpacing: 'var(--crrt-tracking-h2)',
            color: 'var(--crrt-white)',
            margin: '0 0 32px',
            maxWidth: 720,
          }}
        >
          A pretend dashboard.<br />
          <span style={{ color: 'var(--crrt-ink-mute)' }}>Drop a CRRT anywhere.</span>
        </h2>

        {/* Pretend app surface */}
        <div
          style={{
            position: 'relative',
            background: 'var(--crrt-bg-deep)',
            border: '1px solid var(--crrt-rule-dark)',
            borderRadius: 'var(--crrt-radius-2xl)',
            overflow: 'hidden',
            boxShadow: 'var(--crrt-shadow-md)',
          }}
        >
          {/* Pretend nav strip */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--crrt-rule-dark)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57', display: 'inline-block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E', display: 'inline-block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840', display: 'inline-block' }} />
              </div>
              <span
                style={{
                  fontFamily: 'var(--crrt-font-mono)',
                  fontSize: 13,
                  color: 'var(--crrt-ink-faint)',
                  marginLeft: 8,
                }}
              >
                dashboard.fake.com / analytics
              </span>
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: 13, color: 'var(--crrt-ink-faint)' }}>
              <span>Apr 1 — Jun 29</span>
            </div>
          </div>

          {/* Body grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 480 }}>
            {/* Sidebar */}
            <aside
              style={{
                background: 'var(--crrt-bg-deep)',
                borderRight: '1px solid var(--crrt-rule-dark)',
                padding: 16,
                fontSize: 13,
              }}
            >
              {['Overview', 'Visitors', 'Pages', 'Sources', 'Devices', 'Settings'].map((label, i) => (
                <div
                  key={label}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    color: i === 0 ? 'var(--crrt-white)' : 'var(--crrt-ink-mute)',
                    background: i === 0 ? 'var(--crrt-bg-deep-soft)' : 'transparent',
                    marginBottom: 2,
                    cursor: 'default',
                  }}
                >
                  {label}
                </div>
              ))}
            </aside>

            {/* Main */}
            <main style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Visitors', value: '12,408', delta: '+12.4%' },
                  { label: 'Pageviews', value: '38,210', delta: '+8.1%' },
                  { label: 'Bounce rate', value: '42.7%', delta: '-2.3%' },
                ].map((m) => (
                  <div
                    key={m.label}
                    style={{
                      background: 'var(--crrt-bg-deep-soft)',
                      border: '1px solid var(--crrt-rule-dark)',
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--crrt-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {m.label}
                    </div>
                    <div style={{ fontFamily: 'var(--crrt-font-mono)', fontSize: 22, color: 'var(--crrt-white)', marginTop: 6, fontWeight: 600 }}>
                      {m.value}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--crrt-phosphor)', marginTop: 4, fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em' }}>
                      {m.delta}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fake chart */}
              <div
                style={{
                  background: 'var(--crrt-bg-deep-soft)',
                  border: '1px solid var(--crrt-rule-dark)',
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--crrt-ink-faint)', marginBottom: 12 }}>
                  Visitors · last 3 months
                </div>
                <FakeChart />
              </div>
            </main>
          </div>

          {/* Demo pins — drop in sequentially on mount, then stay alive with
              breathing animations + cycling comments. Reads as "a real team
              is actively reviewing this dashboard". */}
          <DemoPin top="14%" left="73%" delay={100} />
          <DemoPin top="32%" left="94%" delay={400} />

          <DemoComment top="22%" left="42%" popoverSide="below"
            pinDelay={700} popoverDelay={1200}
            comments={VISITORS_COMMENTS} cycleStart={0} />
          <DemoComment top="68%" left="58%" popoverSide="above"
            pinDelay={1100} popoverDelay={1600}
            comments={CHART_COMMENTS} cycleStart={1} />
        </div>
      </div>
    </section>
  )
}

function FakeChart() {
  // Deterministic fake area chart with two series.
  const pts1 = [12, 18, 14, 22, 28, 24, 32, 30, 38, 34, 42, 38, 48, 44, 52, 50, 58, 60, 56, 64]
  const pts2 = [4, 8, 6, 10, 12, 9, 14, 12, 18, 14, 20, 16, 24, 20, 28, 24, 30, 32, 28, 36]
  const max = 80
  const w = 800
  const h = 180
  const stepX = w / (pts1.length - 1)

  const toPath = (pts: number[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${h - (p / max) * h}`).join(' ')

  const toArea = (pts: number[]) =>
    `${toPath(pts)} L ${w} ${h} L 0 ${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#E8853D" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#E8853D" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFB000" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFB000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={toArea(pts1)} fill="url(#g1)" />
      <path d={toPath(pts1)} fill="none" stroke="#E8853D" strokeWidth="2" />
      <path d={toArea(pts2)} fill="url(#g2)" />
      <path d={toPath(pts2)} fill="none" stroke="#FFB000" strokeWidth="1.5" strokeOpacity="0.7" />
    </svg>
  )
}

function DemoPin({ top, left, delay }: { top: string; left: string; delay: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top,
        left,
        width: 28,
        height: 28,
        marginLeft: -14,
        marginTop: -14,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        animation: `crrt-pin-drop 720ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'rgba(232, 133, 61, 0.5)',
          transform: 'translate(-50%, -50%)',
          animation: `crrt-pin-seed-halo 2400ms ease-out ${delay + 500}ms infinite`,
        }}
      />
      <span
        style={{
          position: 'relative',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: PIN_GRADIENT,
          animation: `crrt-pin-seed-bounce 2400ms ease-in-out ${delay + 500}ms infinite`,
        }}
      />
    </div>
  )
}

function DemoComment({
  top,
  left,
  pinDelay,
  popoverDelay,
  popoverSide,
  comments,
  cycleStart = 0,
}: {
  top: string
  left: string
  pinDelay: number
  popoverDelay: number
  popoverSide: 'above' | 'below' | 'right' | 'left'
  comments: DemoCommentData[]
  cycleStart?: number
}) {
  const [idx, setIdx] = useState(cycleStart % comments.length)
  const [phase, setPhase] = useState<'comment' | 'typing'>('comment')
  // Gate the inner content until the popover has finished expanding — keeps
  // the popover background visible during expand without flashing empty
  // content underneath.
  const [active, setActive] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setActive(true), popoverDelay + 540)
    return () => clearTimeout(t)
  }, [popoverDelay])

  useEffect(() => {
    if (!active) return
    if (phase === 'comment') {
      const t = setTimeout(() => setPhase('typing'), 3000)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % comments.length)
      setPhase('comment')
    }, 1000)
    return () => clearTimeout(t)
  }, [phase, active, comments.length])

  const current = comments[idx]!
  const nextAuthor = comments[(idx + 1) % comments.length]!

  const popoverOffset = 18  // gap between pin center and popover edge
  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    width: 240,
    background: 'rgba(18, 18, 18, 0.96)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 12,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  }

  switch (popoverSide) {
    case 'below':
      popoverStyle.top = popoverOffset
      popoverStyle.left = -10
      break
    case 'above':
      popoverStyle.bottom = popoverOffset
      popoverStyle.left = -10
      break
    case 'right':
      popoverStyle.left = popoverOffset
      popoverStyle.top = -10
      break
    case 'left':
      popoverStyle.right = popoverOffset
      popoverStyle.top = -10
      break
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top,
        left,
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {/* Pin — drops in first, with a selected white outline */}
      <div
        style={{
          width: 18,
          height: 18,
          marginLeft: -9,
          marginTop: -9,
          borderRadius: '50%',
          background: PIN_GRADIENT,
          outline: '2px solid #fff',
          outlineOffset: 2,
          boxShadow: [
            '0 0 0 1px rgba(255, 255, 255, 0.14)',
            '0 0 0 2.5px rgba(10, 10, 10, 0.55)',
            '0 0 12px rgba(232, 133, 61, 0.45)',
            '0 2px 6px rgba(10, 10, 10, 0.35)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          ].join(', '),
          animation: `crrt-pin-drop 720ms cubic-bezier(0.34, 1.56, 0.64, 1) ${pinDelay}ms both`,
        }}
      />

      {/* Popover — expands from the pin once the pin has landed */}
      <div
        style={{
          ...popoverStyle,
          animation: `crrt-popover-expand 540ms cubic-bezier(0.34, 1.56, 0.64, 1) ${popoverDelay}ms both`,
          transformOrigin: popoverSide === 'above' ? 'bottom left' : 'top left',
        }}
      >
        {active && (phase === 'comment' ? (
          <div key={`c-${idx}`} style={{ animation: 'crrt-comment-swap 360ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Avatar initials={current.initials} color={current.avatarColor} />
              <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>
                {current.author}
              </span>
              <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 12, color: '#6B6560' }}>
                {current.time}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--crrt-font-sans)', fontSize: 13, lineHeight: 1.5, color: '#E8E5DF' }}>
              {current.body}
            </p>
          </div>
        ) : (
          <div key={`t-${idx}`} style={{ animation: 'crrt-comment-swap 280ms cubic-bezier(0.16, 1, 0.3, 1) both', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar initials={nextAuthor.initials} color={nextAuthor.avatarColor} />
            <span style={{ fontFamily: 'var(--crrt-font-sans)', fontSize: 13, color: '#A8A29A' }}>
              {nextAuthor.author} is typing
            </span>
            <TypingDots />
          </div>
        ))}
      </div>
    </div>
  )
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'var(--crrt-font-sans)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 2 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--crrt-carrot)',
            display: 'inline-block',
            animation: `crrt-typing-dot 1200ms ease-in-out ${i * 180}ms infinite`,
          }}
        />
      ))}
    </span>
  )
}
