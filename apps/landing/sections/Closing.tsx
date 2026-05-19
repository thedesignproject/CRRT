import { useState } from 'react'
import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { ISOLOGO, activateCRRT } from '../lib/crrt'

const npmSnippet = `pnpm add @thedesignproject/feedback-widget`
const reactSnippet = `import { FeedbackWidget } from '@thedesignproject/feedback-widget'

export default function App() {
  return (
    <>
      <YourApp />
      <FeedbackWidget
        projectId="your-key"
        apiBase="https://api.example.com/api"
      />
    </>
  )
}`

export function Closing() {
  return (
    <section
      id="install"
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        borderTop: '1px solid var(--crrt-rule-dark)',
        padding: '80px 32px 80px',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ maxWidth: 720, marginBottom: 56 }}>
          {/* VT323 accent label */}
          <p style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 18, color: 'var(--crrt-carrot)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            margin: '0 0 12px',
          }}>
            / install
          </p>
          {/* Geist Mono big headline */}
          <h2 style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontWeight: 700,
            fontSize: 'clamp(26px, 3.5vw, 44px)',
            lineHeight: 1.1, letterSpacing: '-0.028em',
            color: 'var(--crrt-white)',
            margin: '0 0 16px',
          }}>
            Drop a carrot.<br />
            <span style={{ color: 'var(--crrt-carrot)' }}>Ship a better product</span>
            <span className="cursor-blink" style={{ fontFamily: 'var(--crrt-font-crt)', color: 'var(--crrt-carrot)' }}>_</span>
          </h2>
          <p style={{
            fontFamily: 'var(--crrt-font-sans)',
            fontSize: 15, lineHeight: 1.7,
            color: 'var(--crrt-ink-faint)',
            margin: 0, letterSpacing: '-0.005em',
          }}>
            Two commands and you're live. Works with any React app.
          </p>
        </div>

        {/* Snippet grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 12, marginBottom: 48,
        }}>
          <Snippet title="1. install" code={npmSnippet} />
          <Snippet title="2. mount" code={reactSnippet} />
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 96 }}>
          <PillButton variant="carrot" size="lg" onClick={activateCRRT}>Drop your first carrot</PillButton>
          <PillButton variant="ghost" size="lg" withCarrot={false}>Read the docs</PillButton>
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--crrt-rule-dark)',
          paddingTop: 48,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <img
              src={ISOLOGO}
              alt="CRRT isologo"
              style={{ width: 52, height: 52, borderRadius: '50%', display: 'block', flexShrink: 0 }}
            />
            <div style={{ transform: 'scale(2.2)', transformOrigin: 'left bottom' }}>
              <Wordmark level="display" />
            </div>
          </div>
          {/* VT323 micro tagline — canonical footer slot */}
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 22, letterSpacing: '0.06em',
              color: 'var(--crrt-carrot)',
              lineHeight: 1,
            }}>
              Every carrot is a +1.
            </div>
            <div style={{
              fontFamily: 'var(--crrt-font-sans)',
              fontSize: 12, color: 'var(--crrt-ink-mute)',
              letterSpacing: '-0.005em', marginTop: 6,
            }}>
              visual feedback, freshly picked.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{
      background: 'var(--crrt-bg-deep)',
      border: '1px solid var(--crrt-rule-dark)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--crrt-rule-dark)',
      }}>
        {/* VT323 snippet label accent */}
        <span style={{
          fontFamily: 'var(--crrt-font-crt)',
          fontSize: 18, letterSpacing: '0.06em',
          color: 'var(--crrt-ink-mute)', textTransform: 'uppercase',
        }}>
          {title}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            } catch { /* clipboard unavailable */ }
          }}
          style={{
            fontFamily: 'var(--crrt-font-mono)', fontSize: 11,
            color: copied ? 'var(--crrt-carrot)' : 'var(--crrt-ink-mute)',
            background: 'transparent',
            border: '1px solid var(--crrt-rule-dark)',
            borderRadius: 5, padding: '4px 10px',
            cursor: 'pointer', transition: 'color 150ms, border-color 150ms',
          }}
          onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--crrt-rule-dark-strong)' } }}
          onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = 'var(--crrt-ink-mute)'; e.currentTarget.style.borderColor = 'var(--crrt-rule-dark)' } }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '16px 18px',
        fontFamily: 'var(--crrt-font-mono)',
        fontSize: 13, lineHeight: 1.6,
        color: 'var(--crrt-white)',
        overflowX: 'auto', letterSpacing: '0.01em',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
