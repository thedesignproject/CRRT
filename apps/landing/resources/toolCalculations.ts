export function parseHex(value: string) {
  const hex = value.trim().replace(/^#/, '')
  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return null
  const expanded = hex.length === 3 ? [...hex].map(char => char + char).join('') : hex
  return { hex: `#${expanded.toUpperCase()}`, rgb: [0, 2, 4].map(index => parseInt(expanded.slice(index, index + 2), 16)) }
}

export function textContrast(foreground: string, background: string) {
  const fg = parseHex(foreground)
  const bg = parseHex(background)
  if (!fg || !bg) return null
  const luminance = (rgb: number[]) => rgb.map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const a = luminance(fg.rgb)
  const b = luminance(bg.rgb)
  return { foreground: fg.hex, background: bg.hex, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
}

export function convertCssUnits(value: string, root: string, direction: 'px-to-rem' | 'rem-to-px') {
  if (!value.trim() || !root.trim()) return null
  const amount = Number(value)
  const rootSize = Number(root)
  if (!Number.isFinite(amount) || !Number.isFinite(rootSize) || rootSize <= 0) return null
  const converted = direction === 'px-to-rem' ? amount / rootSize : amount * rootSize
  if (!Number.isFinite(converted)) return null
  return `${Number(converted.toFixed(6))}${direction === 'px-to-rem' ? 'rem' : 'px'}`
}

export type FeedbackFields = { target: string; observation: string; outcome: string; constraints: string; verification: string }

export function buildFeedbackBrief(fields: FeedbackFields) {
  if (!fields.target.trim() || !fields.observation.trim() || !fields.outcome.trim() || !fields.verification.trim()) return ''
  return [
    '# Visual feedback brief',
    `## Target\n${fields.target.trim()}`,
    `## Observed problem\n${fields.observation.trim()}`,
    `## Expected outcome\n${fields.outcome.trim()}`,
    `## Preserve and reuse\n${fields.constraints.trim() || 'Confirm relevant constraints before implementation.'}`,
    `## Verify\n${fields.verification.trim()}`,
    'Review this draft and confirm the accepted scope before implementation.',
  ].join('\n\n')
}
