/**
 * CRRT.>_ wordmark with blinking terminal cursor.
 * Sizes scale via `level`. Use level="display" for hero, "nav" for the top bar.
 */
export function Wordmark({ level = 'nav' }: { level?: 'nav' | 'display' }) {
  const sizes = {
    nav: { mark: 18, prompt: 18, gap: 1, weight: 700 },
    display: { mark: 56, prompt: 56, gap: 2, weight: 700 },
  } as const
  const s = sizes[level]
  return (
    <span
      className="inline-flex items-end"
      style={{
        fontFamily: 'var(--crrt-font-mono)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        gap: s.gap,
      }}
    >
      <span style={{ color: 'var(--crrt-white)', fontSize: s.mark, fontWeight: s.weight }}>
        CRRT
      </span>
      <span style={{ color: 'var(--crrt-ink-mute)', fontSize: s.prompt, fontWeight: s.weight }}>
        .
      </span>
      <span style={{ color: 'var(--crrt-ink-mute)', fontSize: s.prompt, fontWeight: s.weight }}>
        {'>'}
      </span>
      <span
        className="cursor-blink"
        style={{ color: 'var(--crrt-carrot)', fontSize: s.prompt, fontWeight: s.weight }}
      >
        _
      </span>
    </span>
  )
}
