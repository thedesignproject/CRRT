import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectReleaseFiles, pngDimensions, readExtensionVersion, relativeReleasePath, releaseMetadata, STORE_CSP, STORE_ICON_SIZES, STORE_PERMISSIONS, validateReleaseFiles } from './release'

function png(width: number, height = width): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function manifest(overrides: Record<string, unknown> = {}) {
  const icons = Object.fromEntries(STORE_ICON_SIZES.map((size) => [size, `icons/icon-${size}.png`]))
  return {
    manifest_version: 3,
    name: 'CRRT',
    version: '1.0.0',
    permissions: [...STORE_PERMISSIONS],
    host_permissions: ['https://crrt.ai/*', 'https://project.supabase.co/*'],
    content_security_policy: { extension_pages: STORE_CSP },
    icons,
    action: { default_icon: icons },
    web_accessible_resources: [{ resources: ['private.html'], matches: ['http://*/*', 'https://*/*'] }],
    ...overrides,
  }
}

function releaseFiles(overrides: Record<string, Uint8Array | string> = {}) {
  const values: Record<string, Uint8Array | string> = {
    'manifest.json': JSON.stringify(manifest()),
    'background.js': 'const safe = true',
    'comment.js': 'const activate = true',
    'popup.html': '<main>CRRT</main>',
    'private.html': '<main>Private CRRT UI</main>',
    ...Object.fromEntries(STORE_ICON_SIZES.map((size) => [`icons/icon-${size}.png`, png(size)])),
    ...overrides,
  }
  return new Map(Object.entries(values).map(([path, value]) => [path, typeof value === 'string' ? new TextEncoder().encode(value) : value]))
}

const options = { version: '1.0.0', apiBase: 'https://crrt.ai/api', supabaseUrl: 'https://project.supabase.co' }

describe('extension Store release', () => {
  it('reads the single package version source and rejects invalid Chrome versions', () => {
    expect(readExtensionVersion()).toBe('1.0.0')
    const directory = mkdtempSync(join(tmpdir(), 'crrt-version-'))
    const file = join(directory, 'package.json')
    writeFileSync(file, JSON.stringify({ version: 'one' }))
    expect(() => readExtensionVersion(pathToFileURL(file))).toThrow('Chrome numeric format')
    writeFileSync(file, '[]')
    expect(() => readExtensionVersion(pathToFileURL(file))).toThrow('Extension package must be an object')
  })

  it('validates the complete least-privilege bundle and creates deterministic metadata', () => {
    const files = releaseFiles()
    const validation = validateReleaseFiles(files, options)
    expect(validation.files).toEqual([...files.keys()].sort())
    expect(validation.totalBytes).toBeGreaterThan(0)
    expect(validation.manifestSha256).toHaveLength(64)
    const input = {
      version: '1.0.0',
      commit: 'a'.repeat(40),
      sourceDateEpoch: 1_700_000_000,
      zip: new TextEncoder().encode('same zip'),
      validation,
      apiOrigin: 'https://crrt.ai',
      supabaseOrigin: 'https://project.supabase.co',
    }
    expect(releaseMetadata(input)).toEqual(releaseMetadata(input))
    expect(releaseMetadata(input)).toMatchObject({ builtAt: '2023-11-14T22:13:20.000Z', files: validation.files })
  })

  it.each([
    ['Manifest V3', { manifest_version: 2 }],
    ['version', { version: '2.0.0' }],
    ['permissions', { permissions: [...STORE_PERMISSIONS, 'tabs'] }],
    ['host permissions', { host_permissions: ['https://*/*'] }],
    ['Persistent content scripts', { content_scripts: [] }],
    ['CSP', { content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" } }],
    ['Manifest must declare', { icons: { 16: 'wrong.png' } }],
    ['Manifest must declare', { action: { default_icon: { 16: 'wrong.png' } } }],
    ['web-accessible', { web_accessible_resources: [] }],
    ['Only private.html', { web_accessible_resources: [{ resources: ['comment.js'], matches: ['http://*/*', 'https://*/*'] }] }],
    ['matches', { web_accessible_resources: [{ resources: ['private.html'], matches: ['https://*/*'] }] }],
  ])('rejects an unsafe %s manifest', (message, change) => {
    expect(() => validateReleaseFiles(releaseFiles({ 'manifest.json': JSON.stringify(manifest(change)) }), options)).toThrow(message)
  })

  it.each(['manifest.json', 'background.js', 'comment.js', 'popup.html', 'private.html'])('requires %s', (path) => {
    const files = releaseFiles(); files.delete(path)
    expect(() => validateReleaseFiles(files, options)).toThrow(`missing ${path}`)
  })

  it.each([
    ['debug.map', 'map'],
    ['.env', 'environment'],
    ['assets/.env.production', 'environment'],
  ])('rejects release artifact %s', (path) => {
    expect(() => validateReleaseFiles(releaseFiles({ [path]: 'value' }), options)).toThrow('source maps or environment files')
  })

  it.each([
    ['localhost', 'fetch("http://localhost:3000/api")', 'configured development URL'],
    ['service role', 'SUPABASE_SERVICE_ROLE_KEY', 'service-role credential'],
    ['private key', '-----BEGIN PRIVATE KEY-----', 'private key'],
    ['provider key', `ghp_${'a'.repeat(20)}`, 'provider secret'],
    ['remote script', '<script src="https://bad.example/x.js">', 'remote script'],
    ['worker script', 'importScripts("https://bad.example/x.js")', 'remote worker script'],
    ['Function', 'new Function("return 1")', 'dynamic Function constructor'],
    ['eval', ' eval("1")', 'eval'],
  ])('rejects %s in executable release files', (_name, content, message) => {
    expect(() => validateReleaseFiles(releaseFiles({ 'unsafe.js': content }), options)).toThrow(message)
  })

  it('ignores binary text patterns but validates exact PNG dimensions', () => {
    expect(validateReleaseFiles(releaseFiles({ 'opaque.png': 'localhost' }), options).files).toContain('opaque.png')
    expect(pngDimensions(png(32))).toEqual({ width: 32, height: 32 })
    expect(() => pngDimensions(new Uint8Array(2))).toThrow('must be a PNG')
    expect(() => validateReleaseFiles(releaseFiles({ 'icons/icon-16.png': png(15, 16) }), options)).toThrow('exactly 16x16')
    const files = releaseFiles(); files.delete('icons/icon-32.png')
    expect(() => validateReleaseFiles(files, options)).toThrow('missing icons/icon-32.png')
  })

  it('enforces the unpacked size ceiling', () => {
    expect(() => validateReleaseFiles(releaseFiles({ 'large.png': new Uint8Array(2_000_000) }), options)).toThrow('2 MB')
    expect(() => validateReleaseFiles(releaseFiles({ 'README.md': 'not shipped' }), options)).toThrow('unexpected file type')
  })

  it('collects files safely within the release directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'crrt-release-'))
    writeFileSync(join(directory, 'one.js'), 'one')
    expect(new TextDecoder().decode(collectReleaseFiles(directory, ['one.js']).get('one.js'))).toBe('one')
    expect(relativeReleasePath(directory, join(directory, 'nested', 'two.js'))).toBe('nested/two.js')
    expect(() => relativeReleasePath(directory, join(directory, '..', 'escape.js'))).toThrow('escaped')
    expect(readFileSync(join(directory, 'one.js'), 'utf8')).toBe('one')
  })

  it('rejects invalid provenance metadata', () => {
    const validation = validateReleaseFiles(releaseFiles(), options)
    const base = { version: '1.0.0', commit: 'a'.repeat(40), sourceDateEpoch: 1, zip: png(1), validation, apiOrigin: 'https://crrt.ai', supabaseOrigin: 'https://project.supabase.co' }
    expect(() => releaseMetadata({ ...base, commit: 'short' })).toThrow('full Git SHA')
    expect(() => releaseMetadata({ ...base, sourceDateEpoch: 0 })).toThrow('positive integer')
    expect(() => releaseMetadata({ ...base, sourceDateEpoch: 1.5 })).toThrow('positive integer')
  })
})
