import { expect, it } from 'vitest'
import { buildFeedbackBrief, convertCssUnits, parseHex, textContrast } from './toolCalculations'

it('normalizes supported opaque HEX and rejects other formats', () => {
  expect(parseHex(' #aB3 ')).toEqual({ hex: '#AABB33', rgb: [170, 187, 51] })
  expect(parseHex('202329')?.hex).toBe('#202329')
  for (const value of ['', '#abcd', '#ffffffff', '#zzz', 'rgb(0,0,0)']) expect(parseHex(value)).toBeNull()
})

it('calculates known WCAG pairs without rounding the decision value', () => {
  expect(textContrast('#000', '#fff')?.ratio).toBe(21)
  expect(textContrast('#fff', '#000')?.ratio).toBe(21)
  expect(textContrast('#777', '#777')?.ratio).toBe(1)
  expect(textContrast('#777', '#fff')?.ratio).toBeCloseTo(4.478, 3)
  expect(textContrast('#777', '#fff')!.ratio).toBeLessThan(4.5)
  expect(textContrast('#0a0a0a', '#0b0b0b')!.ratio).toBeGreaterThan(1)
  expect(textContrast('invalid', '#fff')).toBeNull()
  expect(textContrast('#fff', 'invalid')).toBeNull()
})

it('converts CSS lengths with explicit root size, negatives, zero, and rounding', () => {
  expect(convertCssUnits('24', '16', 'px-to-rem')).toBe('1.5rem')
  expect(convertCssUnits('1.5', '20', 'rem-to-px')).toBe('30px')
  expect(convertCssUnits('-24', '16', 'px-to-rem')).toBe('-1.5rem')
  expect(convertCssUnits('0', '16', 'px-to-rem')).toBe('0rem')
  expect(convertCssUnits('1', '3', 'px-to-rem')).toBe('0.333333rem')
  for (const [value, root] of [['', '16'], ['24', ''], ['24', '0'], ['24', '-1'], ['bad', '16'], ['24', 'Infinity'], ['1e309', '16']]) expect(convertCssUnits(value, root, 'px-to-rem')).toBeNull()
  expect(convertCssUnits('1e308', '1e308', 'rem-to-px')).toBeNull()
})

it('builds a reviewable brief and requires the essential context', () => {
  const fields = { target: ' /settings ', observation: 'Action is clipped', outcome: 'Action is reachable', constraints: '', verification: 'Try a narrow screen\nComplete the task' }
  expect(buildFeedbackBrief(fields)).toContain('## Target\n/settings')
  expect(buildFeedbackBrief(fields)).toContain('Confirm relevant constraints before implementation.')
  expect(buildFeedbackBrief({ ...fields, constraints: ' Keep the field labels ' })).toContain('## Preserve and reuse\nKeep the field labels')
  expect(buildFeedbackBrief(fields)).toContain('Try a narrow screen\nComplete the task')
  for (const key of ['target', 'observation', 'outcome', 'verification']) expect(buildFeedbackBrief({ ...fields, [key]: ' ' })).toBe('')
})
