import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

export const STORE_PERMISSIONS = ['activeTab', 'identity', 'scripting', 'storage'] as const
export const STORE_ICON_SIZES = [16, 32, 48, 128] as const
export const STORE_CSP = "script-src 'self'; object-src 'self'"

type ReleaseFiles = ReadonlyMap<string, Uint8Array>
type JsonRecord = Record<string, unknown>

export interface ReleaseValidation {
  files: string[]
  manifest: Uint8Array
  manifestSha256: string
  totalBytes: number
}

export interface ReleaseMetadataInput {
  version: string
  commit: string
  sourceDateEpoch: number
  zip: Uint8Array
  validation: ReleaseValidation
  apiOrigin: string
  supabaseOrigin: string
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function jsonRecord(value: unknown, name: string): JsonRecord {
  requireValue(typeof value === 'object' && value !== null && !Array.isArray(value), `${name} must be an object`)
  return value as JsonRecord
}

function stringArray(value: unknown, name: string): string[] {
  requireValue(Array.isArray(value) && value.every((item) => typeof item === 'string'), `${name} must be a string array`)
  return value
}

function sameStrings(actual: string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function readExtensionVersion(packageJson: string | URL = resolve(process.cwd(), 'apps/extension/package.json')): string {
  const parsed = jsonRecord(JSON.parse(readFileSync(packageJson, 'utf8')), 'Extension package')
  const version = parsed.version
  requireValue(typeof version === 'string' && /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version), 'Extension version must use Chrome numeric format')
  return version
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  requireValue(bytes.length >= 24 && signature.every((byte, index) => bytes[index] === byte), 'Extension icon must be a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export function collectReleaseFiles(root: string, paths: string[]): Map<string, Uint8Array> {
  return new Map(paths.map((path) => [path.split(sep).join('/'), readFileSync(resolve(root, path))]))
}

function validateManifest(manifest: JsonRecord, version: string, apiOrigin: string, supabaseOrigin: string): void {
  requireValue(manifest.manifest_version === 3, 'Release must use Manifest V3')
  requireValue(manifest.version === version, 'Manifest version must match the extension package')
  requireValue(sameStrings(stringArray(manifest.permissions, 'Manifest permissions'), STORE_PERMISSIONS), 'Manifest permissions exceed the reviewed set')
  requireValue(sameStrings(stringArray(manifest.host_permissions, 'Manifest host permissions'), [`${apiOrigin}/*`, `${supabaseOrigin}/*`]), 'Manifest host permissions exceed CRRT services')
  requireValue(manifest.content_scripts === undefined, 'Persistent content scripts are not allowed')
  const csp = jsonRecord(manifest.content_security_policy, 'Manifest CSP')
  requireValue(csp.extension_pages === STORE_CSP, 'Manifest CSP must allow packaged code only')
  const icons = jsonRecord(manifest.icons, 'Manifest icons')
  const action = jsonRecord(manifest.action, 'Manifest action')
  const actionIcons = jsonRecord(action.default_icon, 'Manifest action icons')
  for (const size of STORE_ICON_SIZES) {
    const path = `icons/icon-${size}.png`
    requireValue(icons[String(size)] === path && actionIcons[String(size)] === path, `Manifest must declare the ${size}px icon`)
  }
  const resources = manifest.web_accessible_resources
  requireValue(Array.isArray(resources) && resources.length === 1, 'Only the private frame may be web-accessible')
  const resource = jsonRecord(resources[0], 'Web-accessible resource')
  requireValue(sameStrings(stringArray(resource.resources, 'Web-accessible files'), ['private.html']), 'Only private.html may be web-accessible')
  requireValue(sameStrings(stringArray(resource.matches, 'Web-accessible matches'), ['http://*/*', 'https://*/*']), 'Private frame matches must be explicit HTTP(S) pages')
}

function validateBundleText(path: string, bytes: Uint8Array): void {
  if (!/\.(?:css|html|js|json)$/.test(path)) return
  const text = new TextDecoder().decode(bytes)
  const forbidden: Array<[RegExp, string]> = [
    [/http:\/\/(?:localhost:3000|127\.0\.0\.1:5173|127\.0\.0\.1:54321)(?:\/|\b)/i, 'configured development URL'],
    [/SUPABASE_SERVICE_ROLE_KEY|service_role/i, 'service-role credential'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
    [/\b(?:gh[pousr]_|sk-(?:live-)?|re_)[A-Za-z0-9_-]{16,}/, 'provider secret'],
    [/<script[^>]+src=["']https?:/i, 'remote script'],
    [/\bimportScripts\s*\(\s*["']https?:/i, 'remote worker script'],
    [/\bnew\s+Function\s*\(/, 'dynamic Function constructor'],
    [/(?:^|[^.\w])eval\s*\(/, 'eval'],
  ]
  for (const [pattern, label] of forbidden) requireValue(!pattern.test(text), `${path} contains a forbidden ${label}`)
}

export function validateReleaseFiles(
  files: ReleaseFiles,
  { version, apiBase, supabaseUrl }: { version: string; apiBase: string; supabaseUrl: string },
): ReleaseValidation {
  const names = [...files.keys()].sort()
  for (const required of ['manifest.json', 'background.js', 'comment.js', 'popup.html', 'private.html']) {
    requireValue(files.has(required), `Release is missing ${required}`)
  }
  requireValue(!names.some((path) => path.endsWith('.map') || path.includes('/.env') || path.startsWith('.env')), 'Release must not contain source maps or environment files')
  requireValue(names.every((path) => /\.(?:css|html|js|json|png)$/.test(path)), 'Release contains an unexpected file type')
  const manifestBytes = files.get('manifest.json')!
  const manifest = jsonRecord(JSON.parse(new TextDecoder().decode(manifestBytes)), 'Manifest')
  const apiOrigin = new URL(apiBase).origin
  const supabaseOrigin = new URL(supabaseUrl).origin
  validateManifest(manifest, version, apiOrigin, supabaseOrigin)
  for (const size of STORE_ICON_SIZES) {
    const path = `icons/icon-${size}.png`
    const icon = files.get(path)
    requireValue(icon, `Release is missing ${path}`)
    const dimensions = pngDimensions(icon)
    requireValue(dimensions.width === size && dimensions.height === size, `${path} must be exactly ${size}x${size}`)
  }
  for (const [path, bytes] of files) validateBundleText(path, bytes)
  const totalBytes = [...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0)
  requireValue(totalBytes <= 2_000_000, 'Unpacked extension exceeds the 2 MB release ceiling')
  return { files: names, manifest: manifestBytes, manifestSha256: sha256(manifestBytes), totalBytes }
}

export function releaseMetadata(input: ReleaseMetadataInput) {
  requireValue(/^[a-f0-9]{40}$/i.test(input.commit), 'Release commit must be a full Git SHA')
  requireValue(Number.isInteger(input.sourceDateEpoch) && input.sourceDateEpoch > 0, 'SOURCE_DATE_EPOCH must be a positive integer')
  return {
    schemaVersion: 1,
    extension: 'CRRT',
    version: input.version,
    commit: input.commit,
    builtAt: new Date(input.sourceDateEpoch * 1000).toISOString(),
    zipSha256: sha256(input.zip),
    manifestSha256: input.validation.manifestSha256,
    unpackedBytes: input.validation.totalBytes,
    files: input.validation.files,
    serviceOrigins: { api: input.apiOrigin, supabase: input.supabaseOrigin },
  }
}

export function relativeReleasePath(root: string, file: string): string {
  const path = relative(root, file).split(sep).join('/')
  requireValue(path !== '..' && !path.startsWith('../'), 'Release file escaped its output directory')
  return path
}
