import type { CSSProperties } from 'react'

export interface TextRangeQuoteProps {
  text: string
  // Merged over the base style so each call site can tweak spacing (e.g. the
  // sidebar indents the quote to line up under the comment body).
  style?: CSSProperties
}

// The italic, orange-bordered quote of the text a comment was anchored to.
// Shared by the compose popover and the saved-comment views so the selected
// snippet reads identically everywhere.
export function TextRangeQuote({ text, style }: TextRangeQuoteProps) {
  return (
    <div style={{
      padding: '9px 11px',
      borderLeft: '3px solid #E8853D',
      borderRadius: '0 8px 8px 0',
      background: 'rgba(232, 133, 61, 0.08)',
      color: 'var(--fw-quote)',
      fontSize: 13,
      lineHeight: 1.5,
      fontStyle: 'italic',
      wordBreak: 'break-word',
      display: '-webkit-box',
      WebkitLineClamp: 3,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      ...style,
    }}>
      “{text}”
    </div>
  )
}
