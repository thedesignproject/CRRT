import { useState } from 'react'
import { Wordmark } from '../components/Wordmark'
import { PillButton } from '../components/PillButton'
import { activateCRRT } from '../lib/crrt'

const npmSnippet = `pnpm add @thedesignproject/feedback-widget`
const reactSnippet = `import { FeedbackWidget } from '@thedesignproject/feedback-widget'

export default function App() {
  return (
    <>
      <YourApp />
      <FeedbackWidget projectId="your-key" apiBase="https://api.example.com/api" />
    </>
  )
}`

export function Closing() {
  return (
    <section
      id="install"
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '120px 32px 64px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1120 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 04 install</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span style={{ fontFamily: 'var(--crrt-font-crt)', fontSize: 18, letterSpacing: '0.08em', color: 'var(--crrt-phosphor)' }}>
            two minutes
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
            margin: '0 0 40px',
            maxWidth: 720,
          }}
        >
          Drop a carrot,<br />
          <span style={{ color: 'var(--crrt-carrot)' }}>ship faster.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 64 }}>
          <Snippet title="1. install" code={npmSnippet} />
          <Snippet title="2. mount" code={reactSnippet} />
        </div>

        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 80 }}>
          <PillButton variant="carrot" size="lg" onClick={activateCRRT}>
            Drop your first carrot
          </PillButton>
          <PillButton variant="ghost" size="lg" withCarrot={false}>
            Read the docs
          </PillButton>
        </div>

        {/* Big wordmark footer */}
        <div
          style={{
            borderTop: '1px solid var(--crrt-rule-dark)',
            paddingTop: 64,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 32,
          }}
        >
          <div style={{ transform: 'scale(2.5)', transformOrigin: 'left bottom' }}>
            <Wordmark level="display" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--crrt-ink-mute)', fontFamily: 'var(--crrt-font-crt)', letterSpacing: '0.08em', textAlign: 'right' }}>
            <div>visual feedback,</div>
            <div>freshly picked.</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        border: '1px solid var(--crrt-rule-dark)',
        borderRadius: 'var(--crrt-radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--crrt-rule-dark)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 14,
            letterSpacing: '0.08em',
            color: 'var(--crrt-ink-faint)',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            } catch {
              /* clipboard unavailable */
            }
          }}
          style={{
            fontFamily: 'var(--crrt-font-mono)',
            fontSize: 11,
            color: copied ? 'var(--crrt-carrot)' : 'var(--crrt-ink-mute)',
            background: 'transparent',
            border: '1px solid var(--crrt-rule-dark)',
            borderRadius: 6,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontFamily: 'var(--crrt-font-mono)',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--crrt-white)',
          overflowX: 'auto',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
