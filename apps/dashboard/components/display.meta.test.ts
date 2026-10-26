import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { meta as lineChart } from './LineChart.meta'
import { meta as metricCard } from './MetricCard.meta'
import { meta as statusBreakdown } from './StatusBreakdown.meta'

const metas = [metricCard, statusBreakdown, lineChart]

// Tailwind utility -> CSS variable it resolves to via globals.css @theme.
function referencedTokens(source: string) {
  const vars = new Set(source.match(/--[a-z-]+/g))
  for (const [, name] of source.matchAll(/(?:bg|text|border|ring|stroke)-([a-z][a-z-]*)/g)) vars.add(`--${name}`)
  return vars
}

describe('display component meta', () => {
  it.each(metas)('$name meets the agentic design system quality bar', (meta) => {
    const source = readFileSync(resolve(__dirname, `${meta.name}.tsx`), 'utf8')
    expect(source).toContain(`export function ${meta.name}(`)
    expect(meta.description).not.toMatch(/\.\s+\S/)
    expect(meta.whenToUse.length).toBeGreaterThanOrEqual(2)
    expect(meta.whenNotToUse.length).toBeGreaterThanOrEqual(1)
    expect(meta.semanticTags.length).toBeGreaterThanOrEqual(3)
    expect(meta.examples.length).toBeGreaterThanOrEqual(1)
    const props = source.match(new RegExp(`export function ${meta.name}\\(\\{([^}]*)\\}`))![1]
    expect(props.split(',').map((p) => p.split('=')[0].trim()).filter(Boolean).sort()).toEqual(meta.props.map((p) => p.name).sort())
    const used = referencedTokens(source)
    for (const token of meta.tokens) expect(used, token).toContain(token)
  })
})
