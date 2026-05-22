import { useState } from 'react'
import { PillButton } from '../components/PillButton'
import { activateCRRT } from '../lib/crrt'

const npmSnippet = `pnpm add @thedesignproject/crrt`
const reactSnippet = `import { FeedbackWidget } from '@thedesignproject/crrt'

export default function App() {
  return (
    <>
      <YourApp />
      <FeedbackWidget
        projectId="proj_your_app_name"
        apiBase="https://crrt.ai/api"
      />
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
          Drop a CRRT.<br />
          <span style={{ color: 'var(--crrt-carrot)' }}>Ship a better product.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 64 }}>
          <Snippet
            number="01"
            title="INSTALL"
            description="Add the package to your project. Works with pnpm, npm, yarn, or bun."
            code={npmSnippet}
          />
          <Snippet
            number="02"
            title="MOUNT IN YOUR APP ROOT"
            description="Drop the widget into your app. projectId scopes the feedback; apiBase points at your CRRT backend."
            code={reactSnippet}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 80 }}>
          <PillButton variant="carrot" size="lg" onClick={activateCRRT}>
            Drop a CRRT →
          </PillButton>
          <PillButton
            variant="ghost"
            size="lg"
            withCarrot={false}
            onClick={() => {
              window.location.href = '/docs/install'
            }}
          >
            Read the docs
          </PillButton>
        </div>
      </div>
    </section>
  )
}

function Snippet({ number, title, description, code }: { number: string; title: string; description: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        border: '1px solid var(--crrt-rule-dark)',
        borderRadius: 'var(--crrt-radius-2xl)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--crrt-rule-dark)',
          gap: 12,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--crrt-carrot)',
              letterSpacing: '-0.01em',
            }}
          >
            {number}.
          </span>
          <span
            style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 13,
              letterSpacing: '0.08em',
              color: 'var(--crrt-ink-faint)',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
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
      <div
        style={{
          padding: '14px 16px 4px',
          fontFamily: 'var(--crrt-font-sans)',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--crrt-ink-faint)',
        }}
      >
        {description}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontFamily: 'var(--crrt-font-mono)',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--crrt-white)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowX: 'auto',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
