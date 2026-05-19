/**
 * Fake product UI — invites the visitor to drop carrots on real-ish content.
 */
export function FakeDashboard() {
  return (
    <section
      id="try"
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        padding: '120px 32px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1120 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 02 fake dashboard</span>
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
          <span style={{ color: 'var(--crrt-ink-mute)' }}>Drop a carrot anywhere.</span>
        </h2>

        {/* Pretend app surface */}
        <div
          style={{
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
                  fontSize: 12,
                  color: 'var(--crrt-ink-faint)',
                  marginLeft: 8,
                }}
              >
                dashboard.fake.com / analytics
              </span>
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: 'var(--crrt-ink-faint)' }}>
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
                    <div style={{ fontSize: 11, color: 'var(--crrt-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {m.label}
                    </div>
                    <div style={{ fontFamily: 'var(--crrt-font-mono)', fontSize: 22, color: 'var(--crrt-white)', marginTop: 6, fontWeight: 600 }}>
                      {m.value}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--crrt-phosphor)', marginTop: 4, fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em' }}>
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
                <div style={{ fontSize: 12, color: 'var(--crrt-ink-faint)', marginBottom: 12 }}>
                  Visitors · last 3 months
                </div>
                <FakeChart />
              </div>
            </main>
          </div>
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
