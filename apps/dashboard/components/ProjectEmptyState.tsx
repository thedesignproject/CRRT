import { useState } from 'react'

interface ProjectEmptyStateProps {
  /** Project public key shown inline in the mount snippet. */
  projectId: string
  /** Backend URL shown inline in the mount snippet. */
  apiBase: string
}

/**
 * Onboarding moment 2: the rich empty state shown in CommentDetail once a
 * project exists but it hasn't received any comments yet. Walks the user
 * through the two install snippets with copy buttons so they can drop the
 * widget into their app without leaving the dashboard.
 */
export function ProjectEmptyState({ projectId, apiBase }: ProjectEmptyStateProps) {
  const installCode = `pnpm add @thedesignproject/crrt`
  const mountCode = `import { FeedbackWidget } from '@thedesignproject/crrt'

export default function App() {
  return (
    <>
      <YourApp />
      <FeedbackWidget
        projectId="${projectId}"
        apiBase="${apiBase}"
      />
    </>
  )
}`

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8 sm:py-12 detail-enter">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span aria-hidden="true">🥕</span>
          <span
            style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 13,
              letterSpacing: '0.08em',
              color: 'var(--crrt-phosphor)',
              textTransform: 'uppercase',
            }}
          >
            your project is live
          </span>
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--crrt-font-mono)',
            fontWeight: 700,
            fontSize: 'clamp(22px, 4vw, 28px)',
            letterSpacing: '-0.015em',
            color: 'var(--foreground)',
            marginBottom: 12,
            textWrap: 'balance',
          }}
        >
          Drop the widget into your app.
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--crrt-font-body, var(--crrt-font-sans))',
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
            marginBottom: 32,
            maxWidth: 520,
            textWrap: 'pretty',
          }}
        >
          Two snippets and you're collecting feedback. We'll show comments here as soon as the first one lands.
        </p>

        <Snippet number="01" title="INSTALL" code={installCode} />
        <div style={{ height: 12 }} />
        <Snippet number="02" title="MOUNT IN YOUR APP ROOT" code={mountCode} />

        {/* Waiting status — terminal-flavored "watching for first CRRT" */}
        <div
          style={{
            marginTop: 32,
            padding: '14px 16px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--crrt-phosphor)',
              flexShrink: 0,
              animation: 'crrt-pulse 2400ms ease-in-out infinite',
            }}
          />
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 13,
              color: 'var(--muted-foreground)',
            }}
          >
            waiting for your first crrt…
          </p>
        </div>

        {/* Docs link */}
        <p style={{ margin: '20px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
          Need more detail?{' '}
          <a
            href="/docs/install"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--crrt-carrot)', textDecoration: 'none' }}
          >
            Read the install guide →
          </a>
        </p>
      </div>
    </div>
  )
}

function Snippet({ number, title, code }: { number: string; title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          gap: 12,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--crrt-font-mono)',
              fontSize: 13,
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
              fontSize: 12,
              letterSpacing: '0.08em',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
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
            color: copied ? 'var(--crrt-carrot)' : 'var(--muted-foreground)',
            background: 'transparent',
            border: '1px solid var(--border)',
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
          lineHeight: 1.6,
          color: 'var(--foreground)',
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
