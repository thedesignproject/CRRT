import { useState, type ReactNode } from 'react'

/**
 * Lightweight prose primitives for the docs site — keep the documentation
 * pages free of repeated styling boilerplate and tied to the same brand
 * variables as the landing.
 */

export function Section({ children }: { children: ReactNode }) {
  return <section style={{ marginBottom: 56 }}>{children}</section>
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: '0 0 16px',
        fontFamily: 'var(--crrt-font-mono)',
        fontWeight: 700,
        fontSize: 'clamp(22px, 3.5vw, 28px)',
        letterSpacing: '-0.015em',
        color: 'var(--crrt-white)',
      }}
    >
      {children}
    </h2>
  )
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        margin: '32px 0 12px',
        fontFamily: 'var(--crrt-font-mono)',
        fontWeight: 600,
        fontSize: 'clamp(17px, 2.5vw, 20px)',
        letterSpacing: '-0.01em',
        color: 'var(--crrt-white)',
      }}
    >
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 14px',
        fontFamily: 'var(--crrt-font-body)',
        fontSize: 16,
        lineHeight: 1.6,
        color: 'var(--crrt-ink-faint)',
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  )
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: 'var(--crrt-white)', fontWeight: 600 }}>{children}</strong>
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        fontFamily: 'var(--crrt-font-mono)',
        fontSize: '0.9em',
        padding: '2px 6px',
        borderRadius: 4,
        background: 'var(--crrt-bg-deep-soft)',
        border: '1px solid var(--crrt-rule-dark)',
        color: 'var(--crrt-white)',
      }}
    >
      {children}
    </code>
  )
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        margin: '0 0 16px',
        paddingLeft: 20,
        fontFamily: 'var(--crrt-font-body)',
        fontSize: 16,
        lineHeight: 1.7,
        color: 'var(--crrt-ink-faint)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {children}
    </ul>
  )
}

export function Ol({ children }: { children: ReactNode }) {
  return (
    <ol
      style={{
        margin: '0 0 16px',
        paddingLeft: 20,
        fontFamily: 'var(--crrt-font-body)',
        fontSize: 16,
        lineHeight: 1.7,
        color: 'var(--crrt-ink-faint)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {children}
    </ol>
  )
}

export function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      style={{
        background: 'var(--crrt-bg-deep-soft)',
        border: '1px solid var(--crrt-rule-dark)',
        borderRadius: 12,
        margin: '0 0 20px',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--crrt-rule-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 12,
            letterSpacing: '0.08em',
            color: 'var(--crrt-ink-mute)',
            textTransform: 'uppercase',
          }}
        >
          {language ?? 'code'}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
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
            padding: '3px 8px',
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
          fontSize: 13.5,
          lineHeight: 1.6,
          color: 'var(--crrt-white)',
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'success'; children: ReactNode }) {
  const palette = {
    info: { bg: 'rgba(255, 176, 0, 0.06)', border: 'rgba(255, 176, 0, 0.32)', dot: 'var(--crrt-phosphor)' },
    warn: { bg: 'rgba(232, 133, 61, 0.08)', border: 'rgba(232, 133, 61, 0.36)', dot: 'var(--crrt-carrot)' },
    success: { bg: 'rgba(51, 255, 51, 0.05)', border: 'rgba(51, 255, 51, 0.24)', dot: 'var(--crrt-phosphor-green)' },
  }[tone]
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        margin: '0 0 20px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: palette.dot,
          flexShrink: 0,
          marginTop: 8,
        }}
      />
      <div
        style={{
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 14.5,
          lineHeight: 1.55,
          color: 'var(--crrt-ink-faint)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function PropsTable({
  rows,
}: {
  rows: Array<{ name: string; type: string; required?: boolean; description: ReactNode }>
}) {
  return (
    <div
      style={{
        margin: '0 0 24px',
        border: '1px solid var(--crrt-rule-dark)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 14,
          color: 'var(--crrt-ink-faint)',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--crrt-bg-deep-soft)' }}>
            {['Prop', 'Type', 'Required', 'Description'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontFamily: 'var(--crrt-font-crt)',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--crrt-ink-mute)',
                  fontWeight: 400,
                  borderBottom: '1px solid var(--crrt-rule-dark)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.name} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--crrt-rule-dark)' }}>
              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                <code
                  style={{
                    fontFamily: 'var(--crrt-font-mono)',
                    fontSize: 13,
                    color: 'var(--crrt-white)',
                  }}
                >
                  {row.name}
                </code>
              </td>
              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                <code
                  style={{
                    fontFamily: 'var(--crrt-font-mono)',
                    fontSize: 12,
                    color: 'var(--crrt-carrot)',
                  }}
                >
                  {row.type}
                </code>
              </td>
              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                {row.required ? (
                  <span style={{ color: 'var(--crrt-carrot)', fontSize: 12 }}>required</span>
                ) : (
                  <span style={{ color: 'var(--crrt-ink-mute)', fontSize: 12 }}>optional</span>
                )}
              </td>
              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NextStep({ href, label, onNavigate }: { href: string; label: string; onNavigate: (path: string) => void }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onNavigate(href)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        marginTop: 16,
        border: '1px solid var(--crrt-rule-dark)',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--crrt-white)',
        textDecoration: 'none',
        fontFamily: 'var(--crrt-font-mono)',
        fontSize: 13,
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--crrt-carrot)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--crrt-rule-dark)'
      }}
    >
      next: {label} →
    </a>
  )
}
