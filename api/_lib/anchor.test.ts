import { describe, expect, it } from 'vitest'
import { parseCommentTarget } from './anchor.js'

const validAnchor = {
  kind: 'text_range',
  selectedText: 'términos y condiciones',
  normalizedText: 'términos y condiciones',
  prefix: 'sujeto a los ',
  suffix: ' vigentes',
  containerSelector: 'section.plans > p.disclaimer',
  startOffset: 13,
  endOffset: 35,
  createdFromUrl: 'https://example.com/pricing',
}

function expectError(targetType: unknown, anchor: unknown, fragment: string) {
  const result = parseCommentTarget(targetType, anchor)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain(fragment)
}

describe('parseCommentTarget', () => {
  it('defaults an absent targetType to element_point with no anchor', () => {
    expect(parseCommentTarget(undefined, undefined)).toEqual({
      ok: true,
      targetType: 'element_point',
      anchor: null,
    })
  })

  it('treats a null targetType as element_point', () => {
    expect(parseCommentTarget(null, null)).toEqual({
      ok: true,
      targetType: 'element_point',
      anchor: null,
    })
  })

  it('accepts an explicit element_point without an anchor', () => {
    expect(parseCommentTarget('element_point', undefined)).toEqual({
      ok: true,
      targetType: 'element_point',
      anchor: null,
    })
  })

  it('rejects unknown targetType values', () => {
    expectError('pixel_blob', undefined, 'targetType must be')
  })

  it('rejects an anchor without text_range targetType', () => {
    expectError(undefined, validAnchor, 'only valid when targetType')
    expectError('element_point', validAnchor, 'only valid when targetType')
  })

  it('accepts a valid text_range anchor and strips unknown keys', () => {
    const result = parseCommentTarget('text_range', { ...validAnchor, junkKey: 'dropped', __proto__: null })
    expect(result).toEqual({ ok: true, targetType: 'text_range', anchor: validAnchor })
  })

  it('rejects non-object anchors', () => {
    expectError('text_range', undefined, 'anchor must be an object')
    expectError('text_range', null, 'anchor must be an object')
    expectError('text_range', 'quote', 'anchor must be an object')
    expectError('text_range', [validAnchor], 'anchor must be an object')
  })

  it('rejects a wrong anchor.kind', () => {
    expectError('text_range', { ...validAnchor, kind: 'element_point' }, 'anchor.kind')
  })

  it.each([
    ['selectedText', 42, 'anchor.selectedText must be a string'],
    ['selectedText', '', 'anchor.selectedText must not be empty'],
    ['selectedText', 'x'.repeat(2001), 'anchor.selectedText must be 2000 characters or fewer'],
    ['normalizedText', 42, 'anchor.normalizedText must be a string'],
    ['normalizedText', 'x'.repeat(2001), 'anchor.normalizedText must be 2000 characters or fewer'],
    ['prefix', 42, 'anchor.prefix must be a string'],
    ['prefix', 'x'.repeat(65), 'anchor.prefix must be 64 characters or fewer'],
    ['suffix', 42, 'anchor.suffix must be a string'],
    ['suffix', 'x'.repeat(65), 'anchor.suffix must be 64 characters or fewer'],
    ['containerSelector', 42, 'anchor.containerSelector must be a string'],
    ['containerSelector', '', 'anchor.containerSelector must not be empty'],
    ['containerSelector', 'x'.repeat(1001), 'anchor.containerSelector must be 1000 characters or fewer'],
    ['createdFromUrl', 42, 'anchor.createdFromUrl must be a string'],
    ['createdFromUrl', '', 'anchor.createdFromUrl must not be empty'],
    ['createdFromUrl', 'x'.repeat(2049), 'anchor.createdFromUrl must be 2048 characters or fewer'],
  ])('rejects invalid %s (%#)', (field, value, fragment) => {
    expectError('text_range', { ...validAnchor, [field]: value }, fragment)
  })

  it('rejects invalid offsets', () => {
    expectError('text_range', { ...validAnchor, startOffset: 1.5 }, 'startOffset')
    expectError('text_range', { ...validAnchor, startOffset: -1 }, 'startOffset')
    expectError('text_range', { ...validAnchor, endOffset: 'end' }, 'endOffset')
    expectError('text_range', { ...validAnchor, startOffset: 35, endOffset: 35 }, 'endOffset')
  })

  it('accepts startOffset 0 for selections at the start of a container', () => {
    const result = parseCommentTarget('text_range', { ...validAnchor, startOffset: 0, endOffset: 5 })
    expect(result.ok).toBe(true)
  })

  it('validates rangeClientRects when present', () => {
    const rect = { left: 1, top: 2, width: 30, height: 4 }

    const ok = parseCommentTarget('text_range', {
      ...validAnchor,
      rangeClientRects: [{ ...rect, junk: true }],
    })
    expect(ok).toEqual({
      ok: true,
      targetType: 'text_range',
      anchor: { ...validAnchor, rangeClientRects: [rect] },
    })

    expectError('text_range', { ...validAnchor, rangeClientRects: rect }, 'rangeClientRects must be an array')
    expectError(
      'text_range',
      { ...validAnchor, rangeClientRects: Array.from({ length: 21 }, () => rect) },
      'at most 20',
    )
    expectError('text_range', { ...validAnchor, rangeClientRects: ['rect'] }, 'entries must be objects')
    expectError(
      'text_range',
      { ...validAnchor, rangeClientRects: [{ ...rect, width: Infinity }] },
      'anchor.rangeClientRects.width must be a finite number',
    )
  })

  it('validates createdAtViewport when present', () => {
    const viewport = { width: 1280, height: 720, scrollX: 0, scrollY: 140 }

    const ok = parseCommentTarget('text_range', {
      ...validAnchor,
      createdAtViewport: { ...viewport, junk: true },
    })
    expect(ok).toEqual({
      ok: true,
      targetType: 'text_range',
      anchor: { ...validAnchor, createdAtViewport: viewport },
    })

    expectError('text_range', { ...validAnchor, createdAtViewport: 'wide' }, 'createdAtViewport must be an object')
    expectError(
      'text_range',
      { ...validAnchor, createdAtViewport: { ...viewport, scrollY: NaN } },
      'anchor.createdAtViewport.scrollY must be a finite number',
    )
  })

  it('rejects anchors that serialize beyond the size cap', () => {
    // Quote characters double in JSON, so length-valid fields can still
    // overflow the serialized cap.
    const oversize = {
      ...validAnchor,
      selectedText: '"'.repeat(2000),
      normalizedText: '"'.repeat(2000),
      containerSelector: '"'.repeat(1000),
      createdFromUrl: '"'.repeat(2048),
      prefix: '"'.repeat(64),
      suffix: '"'.repeat(64),
      rangeClientRects: Array.from({ length: 20 }, () => ({
        left: Number.MAX_VALUE,
        top: Number.MAX_VALUE,
        width: Number.MAX_VALUE,
        height: Number.MAX_VALUE,
      })),
    }
    expectError('text_range', oversize, '16384 characters of JSON or fewer')
  })
})
