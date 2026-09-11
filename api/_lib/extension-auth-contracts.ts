import { createHash, randomBytes } from 'node:crypto'

const EXTENSION_ID = /^[a-p]{32}$/
const PROOF_256 = /^[A-Za-z0-9_-]{43}$/
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/
const CALLBACK_PATH = '/crrt-auth'

export class ExtensionAuthContractError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExtensionAuthContractError(400, 'Invalid request')
  }
  return value as Record<string, unknown>
}

function proof(value: unknown, label: string): string {
  if (typeof value !== 'string' || !PROOF_256.test(value)) {
    throw new ExtensionAuthContractError(400, `Invalid ${label}`)
  }
  return value
}

function verifier(value: unknown): string {
  if (typeof value !== 'string' || !PKCE_VERIFIER.test(value)) {
    throw new ExtensionAuthContractError(400, 'Invalid PKCE verifier')
  }
  return value
}

export function parseChromeRedirect(value: unknown) {
  if (typeof value !== 'string') throw new ExtensionAuthContractError(400, 'Invalid redirect URI')
  try {
    const url = new URL(value)
    const match = /^([a-p]{32})\.chromiumapp\.org$/.exec(url.hostname)
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.pathname !== CALLBACK_PATH
      || url.search
      || url.hash
      || !match
    ) throw new Error('invalid')
    return { extensionId: match[1]!, redirectUri: url.href }
  } catch {
    throw new ExtensionAuthContractError(400, 'Invalid redirect URI')
  }
}

function configuredIds(value: string | undefined, name: string): string[] {
  if (!value?.trim()) return []
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (ids.some((id) => !EXTENSION_ID.test(id))) {
    throw new ExtensionAuthContractError(500, `Server misconfigured: invalid ${name}`)
  }
  return ids
}

export function allowedExtensionIds(environment = process.env): Set<string> {
  const production = configuredIds(environment.EXTENSION_ALLOWED_IDS, 'EXTENSION_ALLOWED_IDS')
  const deployedToProduction = environment.VERCEL_ENV === 'production'
    || (!environment.VERCEL_ENV && environment.NODE_ENV === 'production')
  const development = deployedToProduction
    ? []
    : configuredIds(environment.EXTENSION_DEVELOPMENT_IDS, 'EXTENSION_DEVELOPMENT_IDS')
  return new Set([...production, ...development])
}

export function requireAllowedExtension(extensionId: string, environment = process.env) {
  if (!allowedExtensionIds(environment).has(extensionId)) {
    throw new ExtensionAuthContractError(403, 'Extension is not allowed')
  }
}

export function extensionIdFromOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^chrome-extension:\/\/([a-p]{32})$/.exec(value)?.[1] ?? null
}

export function parseHandoffRequest(value: unknown) {
  const input = record(value)
  const state = proof(input.state, 'state')
  const codeChallenge = proof(input.codeChallenge, 'PKCE challenge')
  const redirect = parseChromeRedirect(input.redirectUri)
  return { ...redirect, state, codeChallenge }
}

export function pkceChallenge(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('base64url')
}

export function parseExchangeRequest(value: unknown) {
  const input = record(value)
  const code = proof(input.code, 'handoff code')
  const state = proof(input.state, 'state')
  const pkceVerifier = verifier(input.verifier)
  const redirect = parseChromeRedirect(input.redirectUri)
  return { ...redirect, code, state, pkceVerifier, codeChallenge: pkceChallenge(pkceVerifier) }
}

export function createProof(): string {
  return randomBytes(32).toString('base64url')
}

export function hashProof(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('hex')
}

export function chromeCallbackUrl(redirectUri: string, code: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  url.searchParams.set('state', state)
  return url.href
}
