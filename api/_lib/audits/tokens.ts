import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { auditTokenSecret } from './config.js'

const SESSION_VERSION = 'v1'

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createAuditCapability(seed?: string, env = process.env) {
  const token = seed
    ? createHmac('sha256', auditTokenSecret(env)).update(`audit-capability:${seed}`).digest('base64url')
    : randomBytes(32).toString('base64url')
  return { token, hash: digest(token) }
}

export function hashAuditCapability(token: string) {
  return digest(token)
}

export function createOrVerifyAuditSession(presented: string | undefined, env = process.env) {
  const secret = auditTokenSecret(env)
  if (presented) {
    const [version, id, supplied] = presented.split('.')
    const unsigned = `${version}.${id}`
    if (version === SESSION_VERSION && id && supplied && safeEqual(supplied, signature(unsigned, secret))) {
      return { token: presented, hash: digest(id), created: false }
    }
  }
  const id = randomBytes(24).toString('base64url')
  const unsigned = `${SESSION_VERSION}.${id}`
  return { token: `${unsigned}.${signature(unsigned, secret)}`, hash: digest(id), created: true }
}

export function hashAuditIp(ip: string, env = process.env) {
  return createHmac('sha256', auditTokenSecret(env)).update(ip.trim().toLowerCase()).digest('hex')
}
