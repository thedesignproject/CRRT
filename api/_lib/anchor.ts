export type CommentTargetType = 'element_point' | 'text_range'

export type ParsedTarget =
  | { ok: true; targetType: CommentTargetType; anchor: Record<string, unknown> | null }
  | { ok: false; error: string }

// Hard ceiling on the sanitized anchor JSON persisted to jsonb.
const MAX_ANCHOR_JSON_LENGTH = 16384
const MAX_CLIENT_RECTS = 20

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkText(value: unknown, name: string, minLength: number, maxLength: number): string | null {
  if (typeof value !== 'string') return `anchor.${name} must be a string`
  if (value.length < minLength) return `anchor.${name} must not be empty`
  if (value.length > maxLength) return `anchor.${name} must be ${maxLength} characters or fewer`
  return null
}

function checkFiniteNumbers(value: Record<string, unknown>, keys: string[], name: string): string | null {
  for (const key of keys) {
    const n = value[key]
    if (typeof n !== 'number' || !Number.isFinite(n)) return `anchor.${name}.${key} must be a finite number`
  }
  return null
}

/**
 * Validates and whitelist-rebuilds a text_range anchor. Returns the sanitized
 * anchor object on success, or an error message string. Unknown keys are
 * dropped so arbitrary client JSON never reaches the database.
 */
function sanitizeTextRangeAnchor(anchor: unknown): Record<string, unknown> | string {
  if (!isPlainObject(anchor)) return 'anchor must be an object when targetType is text_range'
  if (anchor.kind !== 'text_range') return 'anchor.kind must be "text_range"'

  const error =
    checkText(anchor.selectedText, 'selectedText', 1, 2000) ??
    checkText(anchor.normalizedText, 'normalizedText', 0, 2000) ??
    checkText(anchor.prefix, 'prefix', 0, 64) ??
    checkText(anchor.suffix, 'suffix', 0, 64) ??
    checkText(anchor.containerSelector, 'containerSelector', 1, 1000) ??
    checkText(anchor.createdFromUrl, 'createdFromUrl', 1, 2048)
  if (error) return error

  const { startOffset, endOffset } = anchor
  if (!Number.isInteger(startOffset) || (startOffset as number) < 0) {
    return 'anchor.startOffset must be a non-negative integer'
  }
  if (!Number.isInteger(endOffset) || (endOffset as number) <= (startOffset as number)) {
    return 'anchor.endOffset must be an integer greater than startOffset'
  }

  const sanitized: Record<string, unknown> = {
    kind: 'text_range',
    selectedText: anchor.selectedText,
    normalizedText: anchor.normalizedText,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    containerSelector: anchor.containerSelector,
    startOffset,
    endOffset,
    createdFromUrl: anchor.createdFromUrl,
  }

  if (anchor.rangeClientRects !== undefined) {
    if (!Array.isArray(anchor.rangeClientRects) || anchor.rangeClientRects.length > MAX_CLIENT_RECTS) {
      return `anchor.rangeClientRects must be an array of at most ${MAX_CLIENT_RECTS} rects`
    }
    const rects: Array<Record<string, unknown>> = []
    for (const rect of anchor.rangeClientRects) {
      if (!isPlainObject(rect)) return 'anchor.rangeClientRects entries must be objects'
      const rectError = checkFiniteNumbers(rect, ['left', 'top', 'width', 'height'], 'rangeClientRects')
      if (rectError) return rectError
      rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    sanitized.rangeClientRects = rects
  }

  if (anchor.createdAtViewport !== undefined) {
    if (!isPlainObject(anchor.createdAtViewport)) return 'anchor.createdAtViewport must be an object'
    const viewportError = checkFiniteNumbers(
      anchor.createdAtViewport,
      ['width', 'height', 'scrollX', 'scrollY'],
      'createdAtViewport',
    )
    if (viewportError) return viewportError
    const { width, height, scrollX, scrollY } = anchor.createdAtViewport
    sanitized.createdAtViewport = { width, height, scrollX, scrollY }
  }

  if (JSON.stringify(sanitized).length > MAX_ANCHOR_JSON_LENGTH) {
    return `anchor must serialize to ${MAX_ANCHOR_JSON_LENGTH} characters of JSON or fewer`
  }

  return sanitized
}

/**
 * Parses the optional targetType/anchor pair from a public comment payload.
 * Legacy payloads (no targetType) resolve to element_point with no anchor.
 */
export function parseCommentTarget(targetType: unknown, anchor: unknown): ParsedTarget {
  if (targetType !== undefined && targetType !== null && targetType !== 'element_point' && targetType !== 'text_range') {
    return { ok: false, error: 'targetType must be "element_point" or "text_range"' }
  }

  if (targetType !== 'text_range') {
    if (anchor !== undefined && anchor !== null) {
      return { ok: false, error: 'anchor is only valid when targetType is "text_range"' }
    }
    return { ok: true, targetType: 'element_point', anchor: null }
  }

  const sanitized = sanitizeTextRangeAnchor(anchor)
  if (typeof sanitized === 'string') return { ok: false, error: sanitized }
  return { ok: true, targetType: 'text_range', anchor: sanitized }
}
