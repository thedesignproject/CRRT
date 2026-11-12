import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { avatarColor, getInitials } from './format'
import { TextRangeQuote } from './quote'

/** Shared by the floating widget and its inline conversation surface. */
export function FeedbackAuthor({ author, resolved, meta, actions }: { author: string; resolved: boolean; meta?: ReactNode; actions?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: resolved ? '#2C2C2C' : avatarColor(author), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
      {getInitials(author) ?? (author[0] || 'U').toUpperCase()}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fw-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{author}</span>
      {meta}
    </div>
    {actions}
  </div>
}

export function FeedbackContent({ body, quote, resolved }: { body: string; quote?: string; resolved: boolean }) {
  return <>
    {quote && <TextRangeQuote text={quote} style={{ marginLeft: 32, marginBottom: 6 }} />}
    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: resolved ? 'var(--fw-foreground-faint)' : 'var(--fw-foreground-soft)', marginLeft: 32, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{body}</div>
  </>
}

export function FeedbackSendButton({ disabled, style, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="fw-feedback-send" {...props} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0, minHeight: 30, padding: '0 14px', borderRadius: 9999, border: '1px solid ' + (disabled ? 'var(--fw-contrast-06)' : '#B85F1F'), background: disabled ? 'var(--fw-contrast-04)' : '#E8853D', color: disabled ? 'var(--fw-foreground-faint)' : '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease', ...style }}>{children}</button>
}
