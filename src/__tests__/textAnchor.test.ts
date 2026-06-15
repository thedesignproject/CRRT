import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSelector } from '../lib/getSelector'
import {
  boundaryToTextOffset,
  buildTextRangeAnchor,
  resolveContainer,
  type RangeLike,
  type RangeRect,
} from '../lib/textAnchor'

// container.textContent === 'Hello brave world of text anchors' (33 chars)
function setupDom() {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  const p = document.createElement('p')
  const lead = document.createTextNode('Hello ')
  const b = document.createElement('b')
  b.textContent = 'brave'
  const tail = document.createTextNode(' world of text anchors')
  p.append(lead, b, tail)
  host.appendChild(p)
  document.body.appendChild(host)
  return { host, p, lead, b, tail }
}

function makeRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

const baseOpts = { getSelector, url: 'https://example.com/page' }

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('buildTextRangeAnchor', () => {
  it('anchors a selection within a single text node', () => {
    const { p, lead } = setupDom()
    const built = buildTextRangeAnchor(makeRange(lead, 0, lead, 5), baseOpts)

    expect(built).not.toBeNull()
    expect(built!.container).toBe(p)
    expect(built!.anchor).toMatchObject({
      kind: 'text_range',
      selectedText: 'Hello',
      normalizedText: 'Hello',
      prefix: '',
      suffix: ' brave world of text anchors',
      containerSelector: getSelector(p),
      startOffset: 0,
      endOffset: 5,
      createdFromUrl: 'https://example.com/page',
    })
    expect(built!.anchor.rangeClientRects).toBeUndefined()
    expect(built!.anchor.createdAtViewport).toBeUndefined()
  })

  it('anchors a selection spanning element boundaries', () => {
    const { p, lead, b } = setupDom()
    const built = buildTextRangeAnchor(makeRange(lead, 3, b.firstChild!, 3), {
      ...baseOpts,
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 40 },
    })

    expect(built!.container).toBe(p)
    expect(built!.anchor.selectedText).toBe('lo bra')
    expect(built!.anchor.startOffset).toBe(3)
    expect(built!.anchor.endOffset).toBe(9)
    expect(built!.anchor.prefix).toBe('Hel')
    expect(built!.anchor.suffix).toBe('ve world of text anchors')
    expect(built!.anchor.createdAtViewport).toEqual({ width: 1280, height: 720, scrollX: 0, scrollY: 40 })
  })

  it('handles element-node boundary points (child-index offsets)', () => {
    const { p } = setupDom()
    const built = buildTextRangeAnchor(makeRange(p, 1, p, 2), baseOpts)

    expect(built!.anchor.selectedText).toBe('brave')
    expect(built!.anchor.startOffset).toBe(6)
    expect(built!.anchor.endOffset).toBe(11)
    expect(built!.anchor.prefix).toBe('Hello ')
    expect(built!.anchor.suffix).toBe(' world of text anchors')
  })

  it('clamps the suffix at the container end and the prefix at 30 chars', () => {
    const { tail } = setupDom()
    // ' world of text anchors' — 'anchors' is at [15, 22)
    const built = buildTextRangeAnchor(makeRange(tail, 15, tail, 22), baseOpts)

    expect(built!.anchor.selectedText).toBe('anchors')
    expect(built!.anchor.startOffset).toBe(26)
    expect(built!.anchor.endOffset).toBe(33)
    expect(built!.anchor.prefix).toBe('Hello brave world of text ')
    expect(built!.anchor.suffix).toBe('')
  })

  it('normalizes whitespace in normalizedText but keeps the exact quote', () => {
    const { p } = setupDom()
    p.insertBefore(document.createTextNode('  spaced\n\tout  '), p.firstChild)
    const spaced = p.firstChild as Text
    const built = buildTextRangeAnchor(makeRange(spaced, 0, spaced, 15), baseOpts)

    expect(built!.anchor.selectedText).toBe('  spaced\n\tout  ')
    expect(built!.anchor.normalizedText).toBe('spaced out')
  })

  it('returns null for whitespace-only selections', () => {
    const { tail } = setupDom()
    expect(buildTextRangeAnchor(makeRange(tail, 0, tail, 1), baseOpts)).toBeNull()
  })

  it('returns null when the container is excluded (widget DOM)', () => {
    const { lead } = setupDom()
    const built = buildTextRangeAnchor(makeRange(lead, 0, lead, 5), {
      ...baseOpts,
      isExcluded: () => true,
    })
    expect(built).toBeNull()
  })

  it('returns null when the container is not an HTML element', () => {
    const detached = document.createTextNode('floating text')
    const range: RangeLike = {
      toString: () => 'floating',
      startContainer: detached,
      endContainer: detached,
      startOffset: 0,
      endOffset: 8,
      commonAncestorContainer: detached,
      getClientRects: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    }
    expect(buildTextRangeAnchor(range, baseOpts)).toBeNull()
  })

  it('falls back to the container rect for zero-sized range rects', () => {
    const { p, lead } = setupDom()
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 200, width: 400, height: 50, right: 500, bottom: 250, x: 100, y: 200, toJSON: () => ({}),
    } as DOMRect)

    const built = buildTextRangeAnchor(makeRange(lead, 0, lead, 5), baseOpts)
    expect(built!.midpointClient).toEqual({ x: 300, y: 225 })
  })

  it('uses range rects for the midpoint and caps stored rects at 20', () => {
    const { p, lead } = setupDom()
    const rect: RangeRect = { left: 10, top: 20, width: 100, height: 10 }
    const range: RangeLike = {
      toString: () => 'Hello',
      startContainer: lead,
      endContainer: lead,
      startOffset: 0,
      endOffset: 5,
      commonAncestorContainer: p,
      getClientRects: () => Array.from({ length: 25 }, () => rect),
      getBoundingClientRect: () => rect,
    }

    const built = buildTextRangeAnchor(range, baseOpts)
    expect(built!.anchor.rangeClientRects).toHaveLength(20)
    expect(built!.anchor.rangeClientRects![0]).toEqual(rect)
    expect(built!.midpointClient).toEqual({ x: 60, y: 25 })
  })
})

describe('resolveContainer', () => {
  it('uses the parent element when the common ancestor is a text node', () => {
    const { p, lead } = setupDom()
    const range = makeRange(lead, 0, lead, 5)
    expect(resolveContainer(range)).toBe(p)
  })

  it('uses the common ancestor element directly', () => {
    const { p, lead, b } = setupDom()
    const range = makeRange(lead, 0, b.firstChild!, 2)
    expect(resolveContainer(range)).toBe(p)
  })
})

describe('boundaryToTextOffset', () => {
  it('tolerates element offsets beyond the child count', () => {
    const { p } = setupDom()
    expect(boundaryToTextOffset(p, p, 99)).toBe(33)
  })

  it('returns the full text length when the boundary is outside the container', () => {
    const { p, host } = setupDom()
    const outside = document.createElement('span')
    outside.textContent = 'elsewhere'
    host.appendChild(outside)
    expect(boundaryToTextOffset(p, outside.firstChild!, 2)).toBe(33)
  })
})
