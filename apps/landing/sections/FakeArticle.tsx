export function FakeArticle() {
  return (
    <section style={{
      background: 'var(--crrt-bg-deep)',
      borderTop: '1px solid var(--crrt-rule-dark)',
      padding: '80px 32px 96px',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>

        {/* Section header */}
        <div style={{ marginBottom: 56 }}>
          <p style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 18, color: 'var(--crrt-carrot)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            margin: '0 0 16px',
          }}>
            / how it works
          </p>
          <h2 style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontWeight: 700,
            fontSize: 'clamp(26px, 3.5vw, 44px)',
            lineHeight: 1.1, letterSpacing: '-0.025em',
            color: 'var(--crrt-white)',
            margin: 0,
          }}>
            Drop a carrot.<br />
            <span style={{ color: 'var(--crrt-carrot)' }}>Ship a better product.</span>
          </h2>
        </div>

        {/* Steps — editorial layout, not a grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            {
              n: '01',
              title: 'Install the widget',
              body: 'One component, two props. Add it anywhere in your React tree and you\'re done. No database setup, no backend required.',
              code: '<FeedbackWidget\n  projectId="your-key"\n  apiBase="https://api.you.com/api"\n/>',
              tag: 'install',
            },
            {
              n: '02',
              title: 'Your team drops carrots',
              body: 'Anyone on the page — designer, PM, founder — presses C, clicks the exact pixel, and types a note. The pin stays anchored to the element, not the coordinate.',
              code: null,
              tag: 'feedback',
            },
            {
              n: '03',
              title: 'Approve. Ship.',
              body: 'Open the sidebar, approve a comment, and it joins the agent queue. Your AI gets the pinned screenshot with the exact element selector. Every carrot is a +1.',
              code: null,
              tag: 'ship',
            },
          ].map((step, i, arr) => (
            <div key={step.n} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 64,
              alignItems: 'start',
              padding: '48px 0',
              borderBottom: i < arr.length - 1 ? '1px solid var(--crrt-rule-dark)' : 'none',
            }}>
              {/* Left: number + title */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 20 }}>
                  {/* VT323 accent number */}
                  <span style={{
                    fontFamily: 'var(--crrt-font-crt)',
                    fontSize: 64, color: 'rgba(232, 133, 61, 0.15)',
                    letterSpacing: '0.02em', lineHeight: 1,
                  }}>
                    {step.n}
                  </span>
                  {/* VT323 tag accent */}
                  <span style={{
                    fontFamily: 'var(--crrt-font-crt)',
                    fontSize: 14, color: 'var(--crrt-carrot)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    border: '1px solid rgba(232, 133, 61, 0.25)',
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {step.tag}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: 'var(--crrt-font-sans)',
                  fontWeight: 700,
                  fontSize: 'clamp(20px, 2.2vw, 28px)',
                  letterSpacing: '-0.022em',
                  color: 'var(--crrt-white)',
                  margin: 0, lineHeight: 1.1,
                }}>
                  {step.title}
                </h3>
              </div>

              {/* Right: body + optional code */}
              <div>
                <p style={{
                  fontFamily: 'var(--crrt-font-sans)',
                  fontSize: 15, lineHeight: 1.7,
                  color: 'var(--crrt-ink-faint)',
                  margin: step.code ? '0 0 20px' : 0,
                  letterSpacing: '-0.007em',
                }}>
                  {step.body}
                </p>
                {step.code && (
                  <pre style={{
                    fontFamily: 'var(--crrt-font-mono)',
                    fontSize: 13, lineHeight: 1.6,
                    color: 'var(--crrt-ink-faint)',
                    background: 'var(--crrt-bg-deep-soft)',
                    border: '1px solid var(--crrt-rule-dark)',
                    borderRadius: 8, padding: '14px 16px',
                    margin: 0, overflowX: 'auto',
                  }}>
                    <code>{step.code}</code>
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
