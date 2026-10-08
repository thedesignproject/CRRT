import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('selector motion design tokens', () => {
  const tokens = readFileSync('branding/crrt/tokens.css', 'utf8')
  const docs = readFileSync('branding/CRRT-DESIGN-SYSTEM.md', 'utf8')

  it.each([
    ['--crrt-selector-motion-duration', '250ms'],
    ['--crrt-selector-motion-easing', 'cubic-bezier(.22, 1.18, .36, 1)'],
    ['--crrt-selector-opacity-duration', '120ms'],
  ])('defines and documents %s', (name, value) => {
    expect(tokens).toContain(`${name}: ${value}`)
    expect(docs).toContain(`\`${name}\``)
    expect(docs).toContain(value)
  })
})
