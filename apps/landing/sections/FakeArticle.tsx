/**
 * Editorial content surface — proves the widget works on text/marketing too,
 * not only product UIs.
 */
export function FakeArticle() {
  return (
    <section
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '120px 32px',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 32 }}>
          <span className="section-marker">/ 03 fake article</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 18, letterSpacing: '0.08em', color: 'var(--crrt-ink-faint)' }}>
            works on content too
          </span>
        </div>

        <article>
          <h2
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontWeight: 700,
              fontSize: 'var(--crrt-text-h2)',
              lineHeight: 'var(--crrt-leading-h2)',
              letterSpacing: 'var(--crrt-tracking-h2)',
              color: 'var(--crrt-white)',
              margin: '0 0 12px',
            }}
          >
            On the cost of describing where something is.
          </h2>
          <div style={{ fontSize: 13, color: 'var(--crrt-ink-mute)', marginBottom: 32, fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em' }}>
            BY THE TEAM · MAY 18 12:08
          </div>

          {[
            "The fastest way to talk about a UI is to point at it. The second-fastest is to take a screenshot, mark it up, paste it into a thread, and explain which part you meant. We do the second one a thousand times a week.",
            "Feedback that lives outside the product collects friction. Tools change, threads scroll, screenshots go stale, and the link rot starts. Three months later nobody remembers if the issue was fixed, ignored, or routed somewhere it never came back from.",
            "Carrots are a small protest against that. You drop one on the exact pixel that bothers you. The comment lives there until somebody resolves it. Designers, engineers, PMs and AI agents all see the same thing in the same place.",
            "If you're reading this on the live page, try it: press C, click anywhere in this paragraph, type something. The carrot stays. You can come back tomorrow and it will still be there.",
          ].map((p, i) => (
            <p
              key={i}
              style={{
                fontFamily: 'var(--crrt-font-sans)',
                fontSize: 18,
                lineHeight: 1.7,
                color: 'var(--crrt-ink-faint)',
                margin: '0 0 22px',
              }}
            >
              {p}
            </p>
          ))}

          <blockquote
            style={{
              borderLeft: '2px solid var(--crrt-carrot)',
              padding: '8px 0 8px 20px',
              margin: '32px 0',
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 20,
              lineHeight: 1.4,
              color: 'var(--crrt-white)',
              letterSpacing: '-0.01em',
            }}
          >
            "Drop a carrot, ship faster."
          </blockquote>
        </article>
      </div>
    </section>
  )
}
