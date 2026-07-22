import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * Version marker for encrypted token payloads. Newly-encrypted tokens are
 * prefixed so future key/format migrations can dispatch on it. Unprefixed
 * values are legacy payloads from before versioning: still decrypted with the
 * current key, and self-healed by the share-rotation path when they fail.
 * The prefix can never collide with a legacy payload: legacy values start
 * with a 16-char base64url IV segment, never `v1.`.
 */
const TOKEN_VERSION_PREFIX = 'v1.'

let warnedDevFallback = false

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
}

function getSecretKey() {
  const secret = process.env.SHARE_TOKEN_SECRET
  if (!secret) {
    if (isProductionRuntime()) {
      // Fail loudly: silently falling back to a shared default would encrypt
      // production tokens under a guessable key and break on the next deploy
      // that sets the real secret.
      throw new Error('SHARE_TOKEN_SECRET is not set — refusing to handle share tokens in production')
    }
    if (!warnedDevFallback) {
      warnedDevFallback = true
      console.warn('[tokens] SHARE_TOKEN_SECRET is unset — using the development-only fallback secret')
    }
    return createHash('sha256').update('development-share-token-secret').digest()
  }
  return createHash('sha256').update(secret).digest()
}

export function generateSlug() {
  return randomBytes(6).toString('base64url')
}

export function generateAccessToken() {
  return randomBytes(24).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function encryptToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return TOKEN_VERSION_PREFIX + [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.')
}

export function decryptToken(value: string) {
  const payload = value.startsWith(TOKEN_VERSION_PREFIX)
    ? value.slice(TOKEN_VERSION_PREFIX.length)
    : value // legacy unprefixed payload

  const [ivPart, tagPart, ciphertextPart] = payload.split('.')
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted token payload')
  }

  const iv = Buffer.from(ivPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')
  const ciphertext = Buffer.from(ciphertextPart, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
