export function Features() {
  return (
    <section
      className="scanlines"
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        borderTop: '1px solid var(--crrt-rule-dark)',
        padding: '80px 32px 96px',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>

        <div style={{
          borderLeft: '2px solid var(--crrt-carrot)',
          paddingLeft: 32, marginBottom: 72,
        }}>
          <div style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontWeight: 700,
            fontSize: 'clamp(28px, 3.8vw, 48px)',
            lineHeight: 1.05,
            letterSpacing: '-0.028em',
            color: 'var(--crrt-white)',
            marginBottom: 24,
          }}>
            Every piece of feedback<br />
            <span style={{ color: 'var(--crrt-carrot)' }}>is a power-up.</span>
          </div>
          <p style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 16, lineHeight: 1.7,
            color: 'var(--crrt-ink-faint)',
            maxWidth: 560, margin: 0,
            letterSpacing: '-0.007em',
          }}>
            Carrots have been power-ups since 8-bit consoles. Every resolved comment
            levels the product up. Feedback as the carrot — not the stick.
          </p>
        </div>

        {/* Terminal flow — the operational 3-step */}
        <div style={{
          background: 'var(--crrt-bg-deep)',
          border: '1px solid var(--crrt-rule-dark)',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 72,
        }}>
          {/* Terminal header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid var(--crrt-rule-dark)',
            background: 'var(--crrt-bg-deep-soft)',
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF5F57', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FEBC2E', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28C840', display: 'inline-block' }} />
            <span style={{
              fontFamily: 'var(--crrt-font-mono)', fontSize: 11,
              color: 'var(--crrt-ink-mute)', marginLeft: 8, letterSpacing: '0.03em',
            }}>
              crrt — bash
            </span>
          </div>

          {/* Terminal body */}
          <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
            {[
              {
                cmd: 'CRRT --select',
                desc: 'Click any element on your product. The carrot anchors to the DOM node — not the pixel, not the coordinate.',
              },
              {
                cmd: 'CRRT --prompt',
                desc: 'Approve the comment. Your agent gets the pin, the screenshot, and the exact element selector. Zero copy-paste.',
              },
              {
                cmd: 'CRRT.>_',
                desc: 'The feedback is queued, contextualized, and ready to ship to Claude, Codex, or wherever you build.',
                isLast: true,
              },
            ].map((step, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 32, alignItems: 'start' }}>
                <div>
                  {/* VT323 prompt prefix */}
                  <div style={{
                    fontFamily: 'var(--crrt-font-crt)',
                    fontSize: 14, color: 'var(--crrt-carrot)',
                    letterSpacing: '0.06em', marginBottom: 6,
                  }}>
                    {'>'} step {String(i + 1).padStart(2, '0')}
                  </div>
                  {/* Geist Mono command */}
                  <div style={{
                    fontFamily: 'var(--crrt-font-mono)',
                    fontWeight: 600,
                    fontSize: step.isLast ? 24 : 20,
                    color: step.isLast ? 'var(--crrt-carrot)' : 'var(--crrt-white)',
                    letterSpacing: step.isLast ? '-0.01em' : '-0.005em',
                    lineHeight: 1,
                  }}>
                    {step.isLast
                      ? <>CRRT.&gt;<span className="cursor-blink" style={{ fontFamily: 'var(--crrt-font-crt)' }}>_</span></>
                      : step.cmd
                    }
                  </div>
                </div>
                <p style={{
                  fontFamily: 'var(--crrt-font-sans)',
                  fontSize: 14, lineHeight: 1.65,
                  color: 'var(--crrt-ink-faint)',
                  margin: 0, letterSpacing: '-0.005em',
                  paddingTop: 24,
                }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Agent queue card — makes the AI handoff visible */}
        <div style={{
          background: 'var(--crrt-bg-deep)',
          border: '1px solid var(--crrt-rule-dark)',
          borderLeft: '3px solid var(--crrt-carrot)',
          borderRadius: 12,
          padding: '28px 32px',
          marginBottom: 72,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 32,
          alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 13, color: 'var(--crrt-carrot)',
              letterSpacing: '0.08em', marginBottom: 10,
            }}>
              {'>'} AGENT QUEUE — on approve
            </div>
            <div style={{
              fontFamily: 'var(--crrt-font-sans)', fontWeight: 600,
              fontSize: 15, color: 'var(--crrt-white)',
              letterSpacing: '-0.015em', marginBottom: 12,
            }}>
              Your AI gets the exact context. No copy-paste.
            </div>
            <div style={{
              fontFamily: 'var(--crrt-font-mono)', fontSize: 12,
              color: 'var(--crrt-ink-faint)', lineHeight: 1.8,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {[
                ['element', 'button.checkout-cta#hero'],
                ['comment', '"make this more prominent"'],
                ['screenshot', 'captured ✓'],
                ['selector', 'document.querySelector(...)'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 16 }}>
                  <span style={{ color: 'var(--crrt-ink-mute)', minWidth: 80 }}>{k}</span>
                  <span style={{ color: 'var(--crrt-white)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              fontFamily: 'var(--crrt-font-crt)', fontSize: 12,
              color: 'var(--crrt-ink-mute)', letterSpacing: '0.06em',
              marginBottom: 6,
            }}>ready for</div>
            {['Claude', 'Codex', 'Cursor'].map(name => (
              <div key={name} style={{
                fontFamily: 'var(--crrt-font-mono)', fontWeight: 600,
                fontSize: 13, color: 'var(--crrt-white)',
                background: 'var(--crrt-bg-deep-soft)',
                border: '1px solid var(--crrt-rule-dark)',
                borderRadius: 6, padding: '5px 12px',
                letterSpacing: '-0.01em',
              }}>
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Micro callouts — horizontal row, not a grid */}
        <div style={{
          display: 'flex', gap: 0,
          borderTop: '1px solid var(--crrt-rule-dark)',
          paddingTop: 40,
        }}>
          {[
            { label: 'Point, not describe', body: 'Click the exact pixel. The carrot stays anchored to the element.' },
            { label: 'AI-native', body: 'Approve → agent queue. Your build pipeline gets pinned context, not a Slack thread.' },
            { label: 'Zero drift', body: 'Pins follow DOM nodes through resizes, modals, and dynamic content.' },
            { label: 'One component', body: 'Two props. No backend. Works in any React tree.' },
          ].map((item, i, arr) => (
            <div key={i} style={{
              flex: 1,
              paddingLeft: i > 0 ? 28 : 0,
              paddingRight: i < arr.length - 1 ? 28 : 0,
              borderLeft: i > 0 ? '1px solid var(--crrt-rule-dark)' : 'none',
            }}>
              <div style={{
                fontFamily: 'var(--crrt-font-sans)', fontWeight: 600,
                fontSize: 13, color: 'var(--crrt-white)',
                letterSpacing: '-0.01em', marginBottom: 8,
              }}>
                {item.label}
              </div>
              <p style={{
                fontFamily: 'var(--crrt-font-sans)', fontSize: 13,
                lineHeight: 1.6, color: 'var(--crrt-ink-mute)',
                margin: 0, letterSpacing: '-0.005em',
              }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
