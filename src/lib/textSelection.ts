// Helpers for text-anchored feedback in selecting mode. Both caret APIs are
// point-based: caretPositionFromPoint is the standard, caretRangeFromPoint
// the WebKit fallback.

/** Hard cap mirrored by the API — selections beyond this are truncated. */
export const MAX_SELECTED_TEXT_LENGTH = 2000

export interface SelectionSnapshot {
  text: string
  element: HTMLElement
}

type CaretPositionDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function textNodeAtPoint(x: number, y: number): Node | null {
  const doc = document as CaretPositionDocument
  if (typeof doc.caretPositionFromPoint === 'function') {
    return doc.caretPositionFromPoint(x, y)?.offsetNode ?? null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)?.startContainer ?? null
  }
  return null
}

// True when the pointer sits over actual glyphs — not merely inside an
// element that contains text somewhere. Caret APIs snap to the nearest text
// position, so confirm the point falls within one of the text node's rects.
export function isTextAtPoint(x: number, y: number): boolean {
  const node = textNodeAtPoint(x, y)
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  if (!(node.textContent ?? '').trim()) return false

  const range = document.createRange()
  range.selectNodeContents(node)
  for (const rect of Array.from(range.getClientRects())) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true
    }
  }
  return false
}

// Snapshot of the user's live text selection, or null when there is none
// (collapsed, whitespace-only, or inside the widget's own UI).
export function getSelectionSnapshot(widgetAttr: string): SelectionSnapshot | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const text = selection.toString().trim().slice(0, MAX_SELECTED_TEXT_LENGTH)
  if (!text) return null

  const container = selection.getRangeAt(0).commonAncestorContainer
  const element = container.nodeType === Node.ELEMENT_NODE
    ? (container as HTMLElement)
    : container.parentElement
  if (!element || element.closest(`[${widgetAttr}]`)) return null

  return { text, element }
}

export function clearSelection() {
  window.getSelection()?.removeAllRanges()
}
