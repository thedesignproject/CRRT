const TEXT_NODE = 3
const CONTEXT_LENGTH = 30
const MAX_CLIENT_RECTS = 20

export interface RangeRect {
  left: number
  top: number
  width: number
  height: number
}

// Structural subset of DOM Range so anchors can be built from real ranges in
// the widget and from plain object fixtures in unit tests.
export interface RangeLike {
  toString(): string
  startContainer: Node
  endContainer: Node
  startOffset: number
  endOffset: number
  commonAncestorContainer: Node
  getClientRects(): ArrayLike<RangeRect>
  getBoundingClientRect(): RangeRect
}

export interface TextRangeAnchor {
  kind: 'text_range'
  selectedText: string
  normalizedText: string
  prefix: string
  suffix: string
  containerSelector: string
  startOffset: number
  endOffset: number
  rangeClientRects?: RangeRect[]
  createdFromUrl: string
  createdAtViewport?: { width: number; height: number; scrollX: number; scrollY: number }
}

export interface BuildTextRangeOptions {
  getSelector: (el: Element) => string
  url: string
  viewport?: { width: number; height: number; scrollX: number; scrollY: number }
  isExcluded?: (el: Element) => boolean
}

export interface BuiltTextRangeTarget {
  anchor: TextRangeAnchor
  container: HTMLElement
  midpointClient: { x: number; y: number }
}

export function resolveContainer(
  range: RangeLike,
  isExcluded?: (el: Element) => boolean,
): HTMLElement | null {
  const node = range.commonAncestorContainer
  const el = node.nodeType === TEXT_NODE ? node.parentElement : (node as Element)
  if (!(el instanceof HTMLElement)) return null
  if (isExcluded?.(el)) return null
  return el
}

function textLength(node: Node): number {
  // textContent is only null for Document/DocumentType nodes, which can never
  // appear inside a container walk — assert instead of branching.
  return (node.textContent as string).length
}

// Converts a Range boundary point (node, offset) into a character offset
// within container.textContent, by walking the container subtree in document
// order. For Text boundary nodes the offset is characters into the node; for
// Element boundary nodes it is a child index.
export function boundaryToTextOffset(container: Node, boundaryNode: Node, boundaryOffset: number): number {
  const state = { count: 0, done: false }
  walkToBoundary(container, boundaryNode, boundaryOffset, state)
  return state.count
}

function walkToBoundary(
  current: Node,
  boundaryNode: Node,
  boundaryOffset: number,
  state: { count: number; done: boolean },
): void {
  if (current === boundaryNode) {
    if (current.nodeType === TEXT_NODE) {
      state.count += boundaryOffset
    } else {
      const children = current.childNodes
      for (let i = 0; i < boundaryOffset && i < children.length; i++) {
        state.count += textLength(children[i])
      }
    }
    state.done = true
    return
  }

  if (current.nodeType === TEXT_NODE) {
    state.count += textLength(current)
    return
  }

  for (let i = 0; i < current.childNodes.length; i++) {
    walkToBoundary(current.childNodes[i], boundaryNode, boundaryOffset, state)
    if (state.done) return
  }
}

/**
 * Serializes a live text selection into a portable hybrid anchor (exact quote
 * + prefix/suffix context + text-position offsets + container selector).
 * Returns null for whitespace-only selections and selections whose container
 * is excluded or not a regular HTML element — callers fall through to the
 * click-to-pin path.
 */
export function buildTextRangeAnchor(
  range: RangeLike,
  opts: BuildTextRangeOptions,
): BuiltTextRangeTarget | null {
  const selectedText = range.toString()
  if (selectedText.trim() === '') return null

  const container = resolveContainer(range, opts.isExcluded)
  if (!container) return null

  // Never null for elements (see textLength)
  const containerText = container.textContent as string
  const startOffset = boundaryToTextOffset(container, range.startContainer, range.startOffset)
  const endOffset = boundaryToTextOffset(container, range.endContainer, range.endOffset)

  const anchor: TextRangeAnchor = {
    kind: 'text_range',
    selectedText,
    normalizedText: selectedText.replace(/\s+/g, ' ').trim(),
    prefix: containerText.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset),
    suffix: containerText.slice(endOffset, endOffset + CONTEXT_LENGTH),
    containerSelector: opts.getSelector(container),
    startOffset,
    endOffset,
    createdFromUrl: opts.url,
  }

  const rects = Array.from(range.getClientRects())
    .slice(0, MAX_CLIENT_RECTS)
    .map((rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }))
  if (rects.length > 0) {
    anchor.rangeClientRects = rects
  }

  if (opts.viewport) {
    anchor.createdAtViewport = opts.viewport
  }

  // happy-dom (and detached ranges) report zero-sized range rects; fall back
  // to the container's rect so the pin/popover still lands somewhere sane.
  const rangeRect = range.getBoundingClientRect()
  const rect = rangeRect.width === 0 && rangeRect.height === 0 ? container.getBoundingClientRect() : rangeRect
  const midpointClient = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

  return { anchor, container, midpointClient }
}
