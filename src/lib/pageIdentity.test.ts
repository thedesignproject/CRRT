import { describe, expect, it } from 'vitest'
import { normalizePageIdentity, samePage } from './pageIdentity'

describe('page identity', () => {
  it('removes fragments, tracking parameters, parameter order, and trailing slashes', () => {
    expect(normalizePageIdentity('HTTPS://Example.COM/pricing/?b=2&utm_source=x&a=1#plans'))
      .toBe('https://example.com/pricing?a=1&b=2')
    expect(samePage(
      'https://example.com/pricing/?utm_campaign=launch&a=1',
      'https://example.com/pricing?a=1#details',
    )).toBe(true)
  })

  it('keeps product query parameters and safely handles malformed legacy values', () => {
    expect(samePage('https://example.com/search?q=carrot', 'https://example.com/search?q=potato')).toBe(false)
    expect(normalizePageIdentity('legacy#anchor')).toBe('legacy')
  })
})
