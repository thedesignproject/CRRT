export interface ElementPointAnchor {
  elementX: number
  elementY: number
}

export function readElementPoint(anchor: unknown): ElementPointAnchor | null {
  if (typeof anchor !== 'object' || anchor === null || Array.isArray(anchor)) return null
  const keys = Object.keys(anchor)
  if (keys.length !== 2 || !keys.includes('elementX') || !keys.includes('elementY')) return null
  const { elementX, elementY } = anchor as Record<string, unknown>
  if (typeof elementX !== 'number' || typeof elementY !== 'number') return null
  return elementX >= 0 && elementX <= 1 && elementY >= 0 && elementY <= 1 ? { elementX, elementY } : null
}
