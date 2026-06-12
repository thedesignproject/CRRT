import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SELECTED_TEXT_LENGTH,
  clearSelection,
  getSelectionSnapshot,
  isTextAtPoint,
} from '../lib/textSelection'

// happy-dom doesn't implement the caret APIs — install own properties per test.
const doc = document as unknown as Record<string, unknown>

function stubRangeRects(rects: Array<{ left: number; right: number; top: number; bottom: number }>) {
  vi.spyOn(document, 'createRange').mockReturnValue({
    selectNodeContents: vi.fn(),
    getClientRects: () => rects,
  } as never)
}

function textNode(content: string) {
  return document.createTextNode(content)
}

afterEach(() => {
  vi.restoreAllMocks()
  delete doc.caretPositionFromPoint
  delete doc.caretRangeFromPoint
})

describe('isTextAtPoint', () => {
  it('returns true when the point falls inside a text node rect', () => {
    doc.caretPositionFromPoint = () => ({ offsetNode: textNode('hello world') })
    stubRangeRects([{ left: 0, right: 100, top: 0, bottom: 20 }])
    expect(isTextAtPoint(50, 10)).toBe(true)
  })

  it('returns false when the point misses every rect (each edge)', () => {
    doc.caretPositionFromPoint = () => ({ offsetNode: textNode('hello world') })
    stubRangeRects([
      { left: 60, right: 100, top: 0, bottom: 20 }, // x < left
      { left: 0, right: 40, top: 0, bottom: 20 }, // x > right
      { left: 0, right: 100, top: 15, bottom: 20 }, // y < top
      { left: 0, right: 100, top: 0, bottom: 5 }, // y > bottom
    ])
    expect(isTextAtPoint(50, 10)).toBe(false)
  })

  it('returns false when the text node has no rects at all', () => {
    doc.caretPositionFromPoint = () => ({ offsetNode: textNode('hello') })
    stubRangeRects([])
    expect(isTextAtPoint(50, 10)).toBe(false)
  })

  it('returns false when caretPositionFromPoint yields nothing', () => {
    doc.caretPositionFromPoint = () => null
    expect(isTextAtPoint(5, 5)).toBe(false)
  })

  it('returns false for non-text nodes', () => {
    doc.caretPositionFromPoint = () => ({ offsetNode: document.createElement('div') })
    expect(isTextAtPoint(5, 5)).toBe(false)
  })

  it('returns false for whitespace-only and null text content', () => {
    doc.caretPositionFromPoint = () => ({ offsetNode: textNode('   ') })
    expect(isTextAtPoint(5, 5)).toBe(false)

    doc.caretPositionFromPoint = () => ({ offsetNode: { nodeType: Node.TEXT_NODE, textContent: null } })
    expect(isTextAtPoint(5, 5)).toBe(false)
  })

  it('falls back to caretRangeFromPoint when caretPositionFromPoint is unavailable', () => {
    doc.caretPositionFromPoint = undefined
    doc.caretRangeFromPoint = () => ({ startContainer: textNode('fallback text') })
    stubRangeRects([{ left: 0, right: 100, top: 0, bottom: 20 }])
    expect(isTextAtPoint(50, 10)).toBe(true)

    doc.caretRangeFromPoint = () => null
    expect(isTextAtPoint(50, 10)).toBe(false)
  })

  it('returns false when neither caret API exists', () => {
    doc.caretPositionFromPoint = undefined
    doc.caretRangeFromPoint = undefined
    expect(isTextAtPoint(5, 5)).toBe(false)
  })
})

describe('getSelectionSnapshot', () => {
  function stubSelection(sel: unknown) {
    vi.spyOn(window, 'getSelection').mockReturnValue(sel as never)
  }

  function fakeSelection(overrides: Record<string, unknown> = {}) {
    const container = document.createElement('p')
    document.body.appendChild(container)
    return {
      rangeCount: 1,
      isCollapsed: false,
      toString: () => 'picked text',
      getRangeAt: () => ({ commonAncestorContainer: container }),
      ...overrides,
    }
  }

  afterEach(() => {
    document.querySelectorAll('p, [data-fw]').forEach((n) => n.remove())
  })

  it('returns null when there is no selection object', () => {
    stubSelection(null)
    expect(getSelectionSnapshot('data-fw')).toBeNull()
  })

  it('returns null for empty or collapsed selections', () => {
    stubSelection(fakeSelection({ rangeCount: 0 }))
    expect(getSelectionSnapshot('data-fw')).toBeNull()

    stubSelection(fakeSelection({ isCollapsed: true }))
    expect(getSelectionSnapshot('data-fw')).toBeNull()
  })

  it('returns null for whitespace-only selections', () => {
    stubSelection(fakeSelection({ toString: () => '  \n ' }))
    expect(getSelectionSnapshot('data-fw')).toBeNull()
  })

  it('anchors to the common ancestor element and trims the text', () => {
    stubSelection(fakeSelection({ toString: () => '  picked text  ' }))
    const snap = getSelectionSnapshot('data-fw')
    expect(snap?.text).toBe('picked text')
    expect(snap?.element.tagName).toBe('P')
  })

  it('resolves a text-node ancestor through its parent element', () => {
    const container = document.createElement('p')
    container.textContent = 'inner words'
    document.body.appendChild(container)
    stubSelection(fakeSelection({
      getRangeAt: () => ({ commonAncestorContainer: container.firstChild }),
      toString: () => 'inner words',
    }))
    const snap = getSelectionSnapshot('data-fw')
    expect(snap?.text).toBe('inner words')
    expect(snap?.element).toBe(container)
  })

  it('returns null when the text node has no parent element', () => {
    stubSelection(fakeSelection({
      getRangeAt: () => ({ commonAncestorContainer: document.createTextNode('orphan') }),
      toString: () => 'orphan',
    }))
    expect(getSelectionSnapshot('data-fw')).toBeNull()
  })

  it('ignores selections inside the widget UI', () => {
    const widget = document.createElement('div')
    widget.setAttribute('data-fw', '')
    const inner = document.createElement('span')
    widget.appendChild(inner)
    document.body.appendChild(widget)
    stubSelection(fakeSelection({ getRangeAt: () => ({ commonAncestorContainer: inner }) }))
    expect(getSelectionSnapshot('data-fw')).toBeNull()
  })

  it('caps the captured text at the maximum length', () => {
    stubSelection(fakeSelection({ toString: () => 'x'.repeat(MAX_SELECTED_TEXT_LENGTH + 500) }))
    const snap = getSelectionSnapshot('data-fw')
    expect(snap?.text.length).toBe(MAX_SELECTED_TEXT_LENGTH)
  })
})

describe('clearSelection', () => {
  it('removes all ranges from the current selection', () => {
    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({ removeAllRanges } as never)
    clearSelection()
    expect(removeAllRanges).toHaveBeenCalledOnce()
  })

  it('is a no-op when there is no selection object', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue(null)
    expect(() => clearSelection()).not.toThrow()
  })
})
