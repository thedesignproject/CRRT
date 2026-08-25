import { describe, expect, it } from 'vitest'
import { isAuditDemoHostname, isPublicAddress, UnsafeAuditUrlError, validateAuditRedirect, validateAuditUrl } from './url-safety.js'

describe('audit URL safety', () => {
  it.each([
    ['8.8.8.8', true], ['1.1.1.1', true], ['0.0.0.0', false], ['127.0.0.1', false], ['10.0.0.1', false],
    ['169.254.169.254', false], ['172.16.0.1', false], ['192.168.0.1', false], ['224.0.0.1', false],
    ['100.64.0.1', false], ['192.0.0.1', false], ['192.0.0.9', true], ['198.18.0.1', false], ['198.51.100.1', false], ['198.51.101.1', true], ['203.0.113.1', false], ['203.0.114.1', true],
    ['::1', false], ['fc00::1', false], ['fd00::1', false], ['fe80::1', false], ['ff00::1', false], ['2001:db8::1', false], ['2606:4700:4700::1111', true],
    ['bad', false], ['999.1.1.1', false], ['::ffff:127.0.0.1', false], ['::ffff:7f00:1', false], ['::7f00:1', false], ['fec0::1', false],
    ['64:ff9b::a9fe:a9fe', false], ['64:ff9b::808:808', true], ['64:ff9b:1::1', false], ['3fff::1', false],
    ['100::1', false], ['100:0:0:1::1', false], ['2001:2::1', false], ['2001:10::1', false], ['2001:20::1', false],
    ['2001::1', false], ['2001:1::3', false], ['2002:0808:0808::1', false], ['4000::1', false],
    ['2001:1::1', true], ['2001:1::2', true], ['2001:3::1', true], ['2001:4:112::1', true], ['2001:30::1', true],
  ])('classifies %s', (address, expected) => expect(isPublicAddress(address)).toBe(expected))

  it('normalizes a public target and deduplicates addresses', async () => {
    await expect(validateAuditUrl('https://Example.com/path#hash', async () => ['8.8.8.8', '8.8.8.8']))
      .resolves.toEqual({ url: 'https://example.com/path', origin: 'https://example.com', hostname: 'example.com', addresses: ['8.8.8.8'] })
  })

  it('allows only the exact unreachable demo hostname without DNS', async () => {
    const resolver = async () => { throw new Error('DNS should not be used') }
    await expect(validateAuditUrl('https://demo.crrt.ai/path#hash', resolver)).resolves.toEqual({
      url: 'https://demo.crrt.ai/path', origin: 'https://demo.crrt.ai', hostname: 'demo.crrt.ai', addresses: [],
    })
    expect(isAuditDemoHostname('DEMO.CRRT.AI')).toBe(true)
    expect(isAuditDemoHostname('www.demo.crrt.ai')).toBe(false)
    await expect(validateAuditUrl('https://www.demo.crrt.ai', async () => [])).rejects.toMatchObject({ code: 'host_unreachable' })
  })

  it('uses the system resolver by default for public hostnames', async () => {
    await expect(validateAuditUrl('https://localhost')).rejects.toMatchObject({ code: 'private_target' })
  })

  it.each([
    ['not a url', 'invalid_url'], ['file:///etc/passwd', 'unsupported_protocol'], ['https://user:pass@example.com', 'credentials_not_allowed'],
    ['https://example.com:8080', 'unsupported_port'], ['http://127.0.0.1', 'private_target'], ['http://[::ffff:127.0.0.1]', 'private_target'],
  ])('rejects %s', async (url, code) => {
    await expect(validateAuditUrl(url, async () => ['8.8.8.8'])).rejects.toMatchObject({ code } satisfies Partial<UnsafeAuditUrlError>)
  })

  it('rejects unreachable hosts, private DNS answers, and cross-origin redirects', async () => {
    await expect(validateAuditUrl('https://example.com', async () => [])).rejects.toMatchObject({ code: 'host_unreachable' })
    await expect(validateAuditUrl('https://example.com', async () => { throw new Error('dns') })).rejects.toMatchObject({ code: 'host_unreachable' })
    await expect(validateAuditUrl('https://example.com', async () => ['8.8.8.8', '10.0.0.1'])).rejects.toMatchObject({ code: 'private_target' })
    const target = await validateAuditUrl('https://example.com', async () => ['8.8.8.8'])
    await expect(validateAuditRedirect(target, '/safe', async () => ['8.8.8.8'])).resolves.toMatchObject({ origin: target.origin })
    await expect(validateAuditRedirect(target, 'https://evil.example', async () => ['8.8.4.4'])).rejects.toMatchObject({ code: 'cross_origin_redirect' })
  })
})
