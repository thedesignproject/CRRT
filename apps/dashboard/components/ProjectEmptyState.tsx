import { useId, useState } from 'react'
import { cn } from '../lib/utils'
import { StorybookIntegrationSettings } from './StorybookIntegrationSettings'

interface ProjectEmptyStateProps {
  /** Project public key shown inline in the mount snippet. */
  projectId: string
  apiBase: string
  accessToken: string
  canManage?: boolean
}

/**
 * Onboarding moment 2: the rich empty state shown in CommentDetail once a
 * project exists but it hasn't received any comments yet. Walks the user
 * through the two install snippets with copy buttons so they can drop the
 * widget into their app without leaving the dashboard.
 */
export function ProjectEmptyState({ projectId, apiBase, accessToken, canManage = true }: ProjectEmptyStateProps) {
  const [source, setSource] = useState<'app' | 'storybook'>('app')
  const tabsId = useId()
  const installCode = `pnpm add @thedesignproject/crrt`
  const mountCode = `import { FeedbackWidget } from '@thedesignproject/crrt'

export default function App() {
  return (
    <>
      <YourApp />
      <FeedbackWidget projectId="${projectId}" />
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
          Bring feedback into this project.
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
          Connect your product or Storybook. Feedback from either source lands here with its context attached.
        </p>

        <div role="tablist" aria-label="Feedback source" className="mb-5 inline-flex rounded-lg border border-border bg-card p-1">
          <button
            id={`${tabsId}-app-tab`}
            type="button"
            role="tab"
            aria-selected={source === 'app'}
            aria-controls={`${tabsId}-app-panel`}
            onClick={() => setSource('app')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              source === 'app' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Website / App
          </button>
          <button
            id={`${tabsId}-storybook-tab`}
            type="button"
            role="tab"
            aria-selected={source === 'storybook'}
            aria-controls={`${tabsId}-storybook-panel`}
            onClick={() => setSource('storybook')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              source === 'storybook' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Storybook
          </button>
        </div>

        {source === 'app' ? (
          <div id={`${tabsId}-app-panel`} role="tabpanel" aria-labelledby={`${tabsId}-app-tab`}>
            <Snippet number="01" title="INSTALL" code={installCode} />
            <div style={{ height: 12 }} />
            <Snippet number="02" title="MOUNT IN YOUR APP ROOT" code={mountCode} />
          </div>
        ) : (
          <div id={`${tabsId}-storybook-panel`} role="tabpanel" aria-labelledby={`${tabsId}-storybook-tab`}>
            <StorybookIntegrationSettings
              appearance="setup"
              apiBase={apiBase}
              accessToken={accessToken}
              projectKey={projectId}
              canManage={canManage}
            />
          </div>
        )}

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
