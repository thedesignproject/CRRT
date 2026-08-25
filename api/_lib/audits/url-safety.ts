import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'

export type AuditTarget = {
  url: string
  origin: string
  hostname: string
  addresses: string[]
}

export const AUDIT_DEMO_HOSTNAME = 'demo.crrt.ai'

export function isAuditDemoHostname(hostname: string) {
  return hostname.toLowerCase() === AUDIT_DEMO_HOSTNAME
}

export class UnsafeAuditUrlError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

const publicSpecialIpv4 = new Set(['192.0.0.9', '192.0.0.10'])
const benchmarkIpv4 = ipaddr.parseCIDR('198.18.0.0/15') as [ipaddr.IPv4, number]
const translatedIpv6 = ipaddr.parseCIDR('64:ff9b::/96') as [ipaddr.IPv6, number]
const globalUnicastIpv6 = ipaddr.parseCIDR('2000::/3') as [ipaddr.IPv6, number]
const ianaSpecialIpv6 = ipaddr.parseCIDR('2001::/23') as [ipaddr.IPv6, number]
const globallyReachableIanaIpv6 = [
  '2001:1::1/128',
  '2001:1::2/128',
  '2001:3::/32',
  '2001:4:112::/48',
  '2001:30::/28',
].map((range) => ipaddr.parseCIDR(range) as [ipaddr.IPv6, number])
const blockedUnicastIpv6 = ['64:ff9b:1::/48', '100::/64', '100:0:0:1::/64', '2001:db8::/32', '2002::/16', '3fff::/20', '5f00::/16']
  .map((range) => ipaddr.parseCIDR(range) as [ipaddr.IPv6, number])

function publicIpv4(address: ipaddr.IPv4) {
  return publicSpecialIpv4.has(address.toString()) || (address.range() === 'unicast' && !address.match(benchmarkIpv4))
}

export function isPublicAddress(address: string) {
  if (!isIP(address)) return false
  const parsed = ipaddr.parse(address)
  if (parsed instanceof ipaddr.IPv4) return publicIpv4(parsed)
  const ipv6 = parsed as ipaddr.IPv6
  if (ipv6.isIPv4MappedAddress()) return publicIpv4(ipv6.toIPv4Address())
  if (ipv6.match(translatedIpv6)) return publicIpv4(ipaddr.fromByteArray(ipv6.toByteArray().slice(12)) as ipaddr.IPv4)
  if (!ipv6.match(globalUnicastIpv6) || blockedUnicastIpv6.some((range) => ipv6.match(range))) return false
  return !ipv6.match(ianaSpecialIpv6) || globallyReachableIanaIpv6.some((range) => ipv6.match(range))
}

export async function validateAuditUrl(
  raw: string,
  resolver: (hostname: string) => Promise<string[]> = async (hostname) => (
    (await lookup(hostname, { all: true, verbatim: true })).map((item) => item.address)
  ),
): Promise<AuditTarget> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeAuditUrlError('invalid_url')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UnsafeAuditUrlError('unsupported_protocol')
  if (url.username || url.password) throw new UnsafeAuditUrlError('credentials_not_allowed')
  if (url.port && !['80', '443'].includes(url.port)) throw new UnsafeAuditUrlError('unsupported_port')
  url.hash = ''
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isAuditDemoHostname(hostname)) {
    return { url: url.toString(), origin: url.origin, hostname, addresses: [] }
  }
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname).catch(() => [])
  if (!addresses.length) throw new UnsafeAuditUrlError('host_unreachable')
  if (addresses.some((address) => !isPublicAddress(address))) throw new UnsafeAuditUrlError('private_target')
  return { url: url.toString(), origin: url.origin, hostname, addresses: [...new Set(addresses)].sort() }
}

export async function validateAuditRedirect(
  target: AuditTarget,
  location: string,
  resolver?: (hostname: string) => Promise<string[]>,
) {
  const redirect = await validateAuditUrl(new URL(location, target.url).toString(), resolver)
  if (redirect.origin !== target.origin) throw new UnsafeAuditUrlError('cross_origin_redirect')
  return redirect
}
