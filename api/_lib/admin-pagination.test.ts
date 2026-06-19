import { describe, expect, it } from 'vitest'
import { decodeAdminCursor, encodeAdminCursor, parseAdminLimit } from './admin-pagination.js'

describe('admin pagination', () => {
  it('parses default and valid limits', () => {
    expect(parseAdminLimit(undefined)).toBe(50)
    expect(parseAdminLimit('1')).toBe(1)
    expect(parseAdminLimit('100')).toBe(100)
  })

  it('rejects invalid limits', () => {
    for (const value of [[], '0', '101', '-1', '1.5', 'wat']) {
      expect(() => parseAdminLimit(value)).toThrow('Invalid limit')
    }
  })

  it('round trips cursors and rejects malformed values', () => {
    const value = { kind: 'users', page: 2 }
    expect(decodeAdminCursor(encodeAdminCursor(value))).toEqual(value)
    expect(() => decodeAdminCursor(undefined)).toThrow('Invalid cursor')
    expect(() => decodeAdminCursor('not-json')).toThrow('Invalid cursor')
  })
})
