export const ADMIN_PAGE_DEFAULT = 50
export const ADMIN_PAGE_MAX = 100

export class AdminQueryError extends Error {}

export type AdminPage<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export function parseAdminLimit(value: unknown): number {
  if (value === undefined) return ADMIN_PAGE_DEFAULT
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AdminQueryError('Invalid limit')
  const limit = Number(value)
  if (limit < 1 || limit > ADMIN_PAGE_MAX) throw new AdminQueryError('Invalid limit')
  return limit
}

export function encodeAdminCursor(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function decodeAdminCursor(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) throw new AdminQueryError('Invalid cursor')
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    throw new AdminQueryError('Invalid cursor')
  }
}
