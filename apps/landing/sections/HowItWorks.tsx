import { AgentIcon, TerminalIcon, WidgetCarrotIcon } from '../components/PixelIcons'
import { useReveal } from '../lib/useReveal'

/**
 * How it works — 3 steps with pixel-art "dock icon" identifiers. Editorial
 * card pattern: icon top, title, body. Reuses the dark-soft card surface
 * from Closing snippets for visual rhythm.
 */
const STEPS: { Icon: () => React.ReactElement; title: string; body: string }[] = [
  {
    Icon: TerminalIcon,
    title: 'Drop a Script',
    body: 'Two lines in your app root. Live in any product, on any framework. No rewrites, no auth, no setup.',
  },
  {
    Icon: WidgetCarrotIcon,
    title: 'Leave a Comment',
    body: 'Press C, click any element. Your team marks what is off — feedback lives on the pixel, not in a Slack thread.',
  },
  {
    Icon: AgentIcon,
    title: 'Use the Agent',
    body: 'Approve a pin and it becomes a ready-to-ship prompt for Claude, Codex, or Cursor. Feedback compounds into shipped code.',
  },
]

export function HowItWorks() {
  const reveal = useReveal<HTMLDivElement>()
  return (
    <section
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '120px 32px 96px',
      }}
    >
      <div ref={reveal.ref} className={`mx-auto ${reveal.className}`} style={{ maxWidth: 1120 }}>
        {/* Eyebrow */}
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 02 how it works</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span className="phosphor-eyebrow">three steps. no meetings.</span>
        </div>

        {/* Heading */}
        <h2
          style={{
            fontFamily: 'var(--crrt-font-mono)',
            fontWeight: 700,
            fontSize: 'var(--crrt-text-h2)',
            lineHeight: 'var(--crrt-leading-h2)',
            letterSpacing: 'var(--crrt-tracking-h2)',
            color: 'var(--crrt-white)',
            margin: '0 0 56px',
            maxWidth: 720,
          }}
        >
          Visual feedback,<br />
          <span style={{ color: 'var(--crrt-carrot)', fontStyle: 'italic' }}>freshly picked.</span>
        </h2>

        {/* Steps grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {STEPS.map(({ Icon, title, body }, i) => (
            <article
              key={title}
              className="hover-lift"
              style={{
                background: 'var(--crrt-bg-deep-soft)',
                border: '1px solid var(--crrt-rule-dark)',
                borderRadius: 'var(--crrt-radius-2xl)',
                padding: '28px 24px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              {/* Icon "ignites" sequentially when the section reveals — drives
                  the on/off CRT-style flicker via `crrt-icon-ignite`. */}
              <span
                className={`crrt-icon-cell ${reveal.revealed ? 'is-ignited' : ''}`}
                style={{
                  display: 'inline-block',
                  animationDelay: `${300 + i * 220}ms`,
                }}
              >
                <Icon />
              </span>
              <h3
                style={{
                  fontFamily: 'var(--crrt-font-mono)',
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--crrt-white)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--crrt-font-sans)',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--crrt-ink-faint)',
                  margin: 0,
                }}
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
