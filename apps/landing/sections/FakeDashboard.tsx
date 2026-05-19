import { useState } from 'react'

type Tab = 'analytics' | 'changelog' | 'settings'

export function FakeDashboard() {
  const [tab, setTab] = useState<Tab>('analytics')

  return (
    <section
      id="try"
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        borderTop: '1px solid var(--crrt-rule-dark)',
        padding: '80px 32px 96px',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: 36, flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            {/* VT323 accent label */}
            <p style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 18, color: 'var(--crrt-carrot)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              margin: '0 0 10px',
            }}>
              / try it live
            </p>
            {/* Geist Mono headline */}
            <h2 style={{
              fontFamily: 'var(--crrt-font-sans)',
              fontWeight: 700,
              fontSize: 'clamp(26px, 3.5vw, 44px)',
              lineHeight: 1.1, letterSpacing: '-0.025em',
              color: 'var(--crrt-white)',
              margin: 0,
            }}>
              Press C.<br />
              <span style={{ color: 'var(--crrt-carrot)' }}>Click anything.</span>
            </h2>
          </div>
          {/* VT323 accent instruction */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 6,
            background: 'var(--crrt-bg-deep)',
            border: '1px solid var(--crrt-rule-dark)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crrt-carrot)', display: 'inline-block', boxShadow: '0 0 6px var(--crrt-carrot)' }} />
            <span style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 16, color: 'var(--crrt-ink-faint)', letterSpacing: '0.06em',
            }}>
              HOVER → PRESS C → CLICK
            </span>
          </div>
        </div>

        {/* Fake app */}
        <div style={{
          background: 'var(--crrt-bg-deep)',
          border: '1px solid var(--crrt-rule-dark)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* Window chrome */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 18px',
            borderBottom: '1px solid var(--crrt-rule-dark)',
            background: 'var(--crrt-bg-deep-soft)',
            gap: 12,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840', display: 'inline-block' }} />
            </div>
            <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
              {([
                { id: 'analytics', label: 'Analytics' },
                { id: 'changelog', label: 'Changelog' },
                { id: 'settings', label: 'Settings' },
              ] as { id: Tab; label: string }[]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    fontFamily: 'var(--crrt-font-sans)',
                    fontWeight: 500,
                    fontSize: 12, letterSpacing: '-0.005em',
                    padding: '5px 12px', borderRadius: 5,
                    border: 'none', cursor: 'pointer',
                    background: tab === t.id ? 'var(--crrt-bg-deep)' : 'transparent',
                    color: tab === t.id ? 'var(--crrt-white)' : 'var(--crrt-ink-mute)',
                    transition: 'background 120ms, color 120ms',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'var(--crrt-font-mono)', fontSize: 11,
              color: 'var(--crrt-ink-mute)', letterSpacing: '0.02em',
            }}>
              app.fake.io
            </span>
          </div>

          <div style={{ minHeight: 500 }}>
            {tab === 'analytics' && <AnalyticsTab />}
            {tab === 'changelog' && <ChangelogTab />}
            {tab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </div>
    </section>
  )
}

function Annotatable({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        outline: hovered ? '1.5px solid rgba(232, 133, 61, 0.5)' : '1.5px solid transparent',
        borderRadius: 6, transition: 'outline-color 120ms',
        position: 'relative', ...style,
      }}
    >
      {children}
      {hovered && (
        <span style={{
          position: 'absolute', top: -26, right: 0, zIndex: 10,
          fontFamily: 'var(--crrt-font-crt)',
          fontSize: 14, color: 'var(--crrt-carrot)',
          letterSpacing: '0.06em',
          background: 'var(--crrt-bg-deep)',
          border: '1px solid rgba(232, 133, 61, 0.25)',
          padding: '2px 8px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          PRESS C + CLICK
        </span>
      )}
    </div>
  )
}

function AnalyticsTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '172px 1fr', minHeight: 500 }}>
      <aside style={{ borderRight: '1px solid var(--crrt-rule-dark)', padding: '16px 10px' }}>
        {['Overview', 'Visitors', 'Pages', 'Sources', 'Devices', 'Settings'].map((label, i) => (
          <Annotatable key={label} style={{ marginBottom: 2 }}>
            <div style={{
              padding: '7px 10px', borderRadius: 5, cursor: 'default',
              fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
              fontSize: 13, letterSpacing: '-0.007em',
              color: i === 0 ? 'var(--crrt-white)' : 'var(--crrt-ink-mute)',
              background: i === 0 ? 'var(--crrt-bg-deep-soft)' : 'transparent',
            }}>
              {label}
            </div>
          </Annotatable>
        ))}
      </aside>
      <main style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Visitors', value: '12,408', delta: '+12.4%', up: true },
            { label: 'Pageviews', value: '38,210', delta: '+8.1%', up: true },
            { label: 'Bounce rate', value: '42.7%', delta: '-2.3%', up: false },
          ].map((m) => (
            <Annotatable key={m.label}>
              <div style={{
                background: 'var(--crrt-bg-deep-soft)',
                border: '1px solid var(--crrt-rule-dark)',
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{
                  fontFamily: 'var(--crrt-font-sans)', fontSize: 11, fontWeight: 500,
                  color: 'var(--crrt-ink-mute)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 8,
                }}>
                  {m.label}
                </div>
                <div style={{
                  fontFamily: 'var(--crrt-font-sans)', fontWeight: 700,
                  fontSize: 24, color: 'var(--crrt-white)',
                  letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6,
                }}>
                  {m.value}
                </div>
                <div style={{
                  fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
                  fontSize: 12, letterSpacing: '-0.005em',
                  color: m.up ? '#4ABA74' : 'var(--crrt-carrot)',
                }}>
                  {m.delta}
                </div>
              </div>
            </Annotatable>
          ))}
        </div>
        <Annotatable>
          <div style={{
            background: 'var(--crrt-bg-deep-soft)',
            border: '1px solid var(--crrt-rule-dark)',
            borderRadius: 10, padding: '16px 18px 12px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <div style={{
                fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
                fontSize: 12, color: 'var(--crrt-ink-faint)', letterSpacing: '-0.005em',
              }}>
                Visitors · last 3 months
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <LegendDot color="#E8853D" label="Unique" />
                <LegendDot color="#FFB000" label="Returning" />
              </div>
            </div>
            <FakeChart />
          </div>
        </Annotatable>
      </main>
    </div>
  )
}

function ChangelogTab() {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      {[
        {
          version: 'v0.9.2',
          date: 'May 18, 2025',
          badge: 'latest',
          items: [
            { type: 'feat', text: 'Pin anchoring — pins now follow DOM elements on resize and reflow' },
            { type: 'feat', text: 'Agent queue — approve a comment to push it directly to your AI agent' },
            { type: 'fix', text: 'Dark popover — redesigned comment popovers, now dark glass instead of white' },
            { type: 'fix', text: 'Sidebar auto-closes when entering selection mode to prevent overlap' },
          ],
        },
        {
          version: 'v0.8.0',
          date: 'Apr 3, 2025',
          badge: null,
          items: [
            { type: 'feat', text: 'Screenshot capture — automatically attaches a full-page screenshot to each comment' },
            { type: 'feat', text: 'Name modal — first-time users set a display name before commenting' },
            { type: 'fix', text: 'Fixed localStorage shim for environments with broken persistent storage' },
          ],
        },
      ].map((release) => (
        <Annotatable key={release.version} style={{ marginBottom: 48 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {/* Geist Mono version number */}
              <span style={{
                fontFamily: 'var(--crrt-font-sans)', fontWeight: 700,
                fontSize: 22, color: 'var(--crrt-white)', letterSpacing: '-0.02em',
              }}>
                {release.version}
              </span>
              {release.badge && (
                /* VT323 accent badge */
                <span style={{
                  fontFamily: 'var(--crrt-font-crt)',
                  fontSize: 14, color: 'var(--crrt-carrot)',
                  border: '1px solid rgba(232, 133, 61, 0.3)',
                  background: 'rgba(232, 133, 61, 0.07)',
                  padding: '2px 8px', borderRadius: 4,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {release.badge}
                </span>
              )}
              <span style={{
                fontFamily: 'var(--crrt-font-sans)', fontSize: 12, fontWeight: 400,
                color: 'var(--crrt-ink-mute)', marginLeft: 'auto', letterSpacing: '-0.005em',
              }}>
                {release.date}
              </span>
            </div>
            <div style={{
              borderLeft: '2px solid var(--crrt-rule-dark)',
              paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {release.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* VT323 accent type badge */}
                  <span style={{
                    fontFamily: 'var(--crrt-font-crt)',
                    fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: item.type === 'feat' ? 'var(--crrt-carrot)' : '#4ABA74',
                    marginTop: 2, flexShrink: 0, minWidth: 28,
                  }}>
                    {item.type}
                  </span>
                  <span style={{
                    fontFamily: 'var(--crrt-font-sans)', fontSize: 14, fontWeight: 400,
                    color: 'var(--crrt-ink-faint)', lineHeight: 1.55, letterSpacing: '-0.005em',
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Annotatable>
      ))}
    </div>
  )
}

function SettingsTab() {
  const [toggles, setToggles] = useState({
    slack: true, github: false, agent: true, screenshots: true,
  })
  return (
    <div style={{ padding: '32px 40px', maxWidth: 680 }}>
      <Annotatable style={{ marginBottom: 32 }}>
        <div>
          <div style={{
            fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
            fontSize: 11, color: 'var(--crrt-ink-mute)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16,
          }}>
            General
          </div>
          <div style={{
            background: 'var(--crrt-bg-deep-soft)',
            border: '1px solid var(--crrt-rule-dark)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            {[
              { label: 'Project name', value: 'acme-dashboard' },
              { label: 'API base URL', value: 'https://api.acme.io/api' },
            ].map((field, i) => (
              <div key={field.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: i === 0 ? '1px solid var(--crrt-rule-dark)' : 'none',
              }}>
                <div style={{
                  fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
                  fontSize: 13, color: 'var(--crrt-white)', letterSpacing: '-0.007em',
                }}>
                  {field.label}
                </div>
                <input
                  readOnly defaultValue={field.value}
                  style={{
                    fontFamily: 'var(--crrt-font-mono)', fontSize: 12,
                    color: 'var(--crrt-ink-faint)',
                    background: 'var(--crrt-bg-deep)',
                    border: '1px solid var(--crrt-rule-dark)',
                    borderRadius: 6, padding: '6px 10px',
                    width: 240, outline: 'none', letterSpacing: '0.01em',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </Annotatable>

      <div>
        <div style={{
          fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
          fontSize: 11, color: 'var(--crrt-ink-mute)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16,
        }}>
          Integrations
        </div>
        <div style={{
          background: 'var(--crrt-bg-deep-soft)',
          border: '1px solid var(--crrt-rule-dark)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {[
            { key: 'slack' as const, label: 'Slack notifications', desc: 'Post to a channel when a new carrot is dropped' },
            { key: 'github' as const, label: 'GitHub Issues', desc: 'Create an issue when a comment is approved' },
            { key: 'agent' as const, label: 'AI agent queue', desc: 'Route approved comments to your agent automatically' },
            { key: 'screenshots' as const, label: 'Auto-screenshot', desc: 'Attach a screenshot to every new comment' },
          ].map((item, i, arr) => (
            <Annotatable key={item.key}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--crrt-rule-dark)' : 'none',
              }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--crrt-font-sans)', fontWeight: 500,
                    fontSize: 13, color: 'var(--crrt-white)',
                    letterSpacing: '-0.007em', marginBottom: 3,
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--crrt-font-sans)', fontSize: 12,
                    color: 'var(--crrt-ink-mute)', letterSpacing: '-0.005em',
                  }}>
                    {item.desc}
                  </div>
                </div>
                <Toggle
                  on={toggles[item.key]}
                  onToggle={() => setToggles(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                />
              </div>
            </Annotatable>
          ))}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle}
      style={{
        width: 38, height: 22, borderRadius: 11,
        background: on ? 'var(--crrt-carrot)' : 'var(--crrt-bg-deep)',
        border: `1px solid ${on ? 'var(--crrt-carrot-deep)' : 'var(--crrt-rule-dark)'}`,
        cursor: 'pointer', flexShrink: 0, position: 'relative',
        transition: 'background 150ms, border-color 150ms',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 17 : 3,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        transition: 'left 150ms',
      }} />
    </button>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontFamily: 'var(--crrt-font-sans)', fontWeight: 500, fontSize: 11, color: 'var(--crrt-ink-mute)' }}>{label}</span>
    </div>
  )
}

function FakeChart() {
  const pts1 = [12, 18, 14, 22, 28, 24, 32, 30, 38, 34, 42, 38, 48, 44, 52, 50, 58, 60, 56, 64]
  const pts2 = [4, 8, 6, 10, 12, 9, 14, 12, 18, 14, 20, 16, 24, 20, 28, 24, 30, 32, 28, 36]
  const max = 80; const w = 800; const h = 150
  const stepX = w / (pts1.length - 1)
  const toPath = (pts: number[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${h - (p / max) * h}`).join(' ')
  const toArea = (pts: number[]) => `${toPath(pts)} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h + 10}`} width="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#E8853D" stopOpacity="0.25" /><stop offset="100%" stopColor="#E8853D" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFB000" stopOpacity="0.15" /><stop offset="100%" stopColor="#FFB000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={toArea(pts1)} fill="url(#g1)" />
      <path d={toPath(pts1)} fill="none" stroke="#E8853D" strokeWidth="1.5" />
      <path d={toArea(pts2)} fill="url(#g2)" />
      <path d={toPath(pts2)} fill="none" stroke="#FFB000" strokeWidth="1.5" strokeOpacity="0.55" />
    </svg>
  )
}
