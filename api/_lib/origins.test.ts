import { describe, expect, it } from 'vitest'
import { getRequestHostname, isHostnameAllowed, normalizeAllowedDomain } from './origins.js'

describe('normalizeAllowedDomain', () => {
  it('normalizes bare domains, full URLs, casing, ports, and paths', () => {
    expect(normalizeAllowedDomain('Example.com')).toBe('example.com')
    expect(normalizeAllowedDomain(' https://App.Example.com/path?q=1 ')).toBe('app.example.com')
    expect(normalizeAllowedDomain('example.com/docs')).toBe('example.com')
    expect(normalizeAllowedDomain('localhost:3000')).toBe('localhost')
    expect(normalizeAllowedDomain('example.com.')).toBe('example.com')
  })

  it('returns null for unparseable input', () => {
    expect(normalizeAllowedDomain('')).toBeNull()
    expect(normalizeAllowedDomain('   ')).toBeNull()
    expect(normalizeAllowedDomain('https://')).toBeNull()
    expect(normalizeAllowedDomain('not a domain')).toBeNull()
    expect(normalizeAllowedDomain('file:///etc/hosts')).toBeNull()
  })
})

describe('getRequestHostname', () => {
  const req = (headers: Record<string, unknown>) => ({ headers }) as never

  it('prefers Origin over Referer and lowercases', () => {
    expect(getRequestHostname(req({ origin: 'https://App.Example.com', referer: 'https://other.com/x' }))).toBe('app.example.com')
  })

  it('falls back to Referer when Origin is absent or empty', () => {
    expect(getRequestHostname(req({ referer: 'https://site.example/page' }))).toBe('site.example')
    expect(getRequestHostname(req({ origin: '', referer: 'https://site.example/page' }))).toBe('site.example')
  })

  it('uses the first value of a repeated header', () => {
    expect(getRequestHostname(req({ origin: ['https://a.com', 'https://b.com'] }))).toBe('a.com')
  })

  it('returns null when no header is present', () => {
    expect(getRequestHostname(req({}))).toBeNull()
  })

  it('returns null for unparseable or hostless sources', () => {
    expect(getRequestHostname(req({ origin: 'null' }))).toBeNull()
    expect(getRequestHostname(req({ origin: 'file:///tmp/page.html' }))).toBeNull()
  })
})

describe('isHostnameAllowed', () => {
  it('allows every hostname when the allowlist is empty', () => {
    expect(isHostnameAllowed('anywhere.com', [])).toBe(true)
    expect(isHostnameAllowed(null, [])).toBe(true)
  })

  it('blocks requests without a hostname when the allowlist is set', () => {
    expect(isHostnameAllowed(null, ['example.com'])).toBe(false)
  })

  it('matches exact hostnames and subdomains', () => {
    expect(isHostnameAllowed('example.com', ['example.com'])).toBe(true)
    expect(isHostnameAllowed('app.example.com', ['example.com'])).toBe(true)
  })

  it('rejects unrelated hostnames and suffix lookalikes', () => {
    expect(isHostnameAllowed('other.com', ['example.com'])).toBe(false)
    expect(isHostnameAllowed('evilexample.com', ['example.com'])).toBe(false)
  })

  it('never matches entries that are not normalized hostnames', () => {
    expect(isHostnameAllowed('example.com', ['   ', 'example.com'])).toBe(true)
    expect(isHostnameAllowed('example.com', ['   '])).toBe(false)
  })
})
