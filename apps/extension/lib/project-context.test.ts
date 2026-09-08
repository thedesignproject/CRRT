import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageState = vi.hoisted(() => ({} as Record<string, unknown>))
const local = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
const tabs = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { storage: { local }, tabs } }))

import {
  ACTIVE_PROJECT_STORAGE_KEY,
  getActiveProject,
  getCurrentTabUrl,
  hostProjectStorageKey,
  HOST_PROJECTS_STORAGE_KEY,
  matchingProjects,
  normalizePageHostname,
  resolveProjectForPage,
  resolveProjectSelection,
  setActiveProject,
  setProjectForPage,
  type ExtensionProject,
} from './project-context'

const projects: ExtensionProject[] = [
  { publicKey: 'store', name: 'Store', allowedOrigins: ['example.com'] },
  { publicKey: 'app', name: 'App', allowedOrigins: ['app.example.com'] },
  { publicKey: 'other', name: 'Other', allowedOrigins: ['other.test'] },
]

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(storageState)) delete storageState[key]
  local.get.mockImplementation(async (key: string) => Object.prototype.hasOwnProperty.call(storageState, key)
    ? { [key]: storageState[key] }
    : {})
  local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(storageState, values) })
  local.remove.mockImplementation(async (key: string) => { delete storageState[key] })
})

describe('extension project context', () => {
  it('normalizes pages and finds exact or parent-domain projects', () => {
    expect(normalizePageHostname('https://Shop.Example.com./products#x')).toBe('shop.example.com')
    expect(normalizePageHostname('http://.')).toBeNull()
    expect(normalizePageHostname('chrome://settings')).toBeNull()
    expect(normalizePageHostname('bad')).toBeNull()
    expect(matchingProjects('https://app.example.com', projects).map((project) => project.publicKey)).toEqual(['store', 'app'])
    expect(matchingProjects('https://shop.example.com', projects).map((project) => project.publicKey)).toEqual(['store'])
    expect(matchingProjects('chrome://settings', projects)).toEqual([])
    expect(matchingProjects('https://scheme.test', [
      { publicKey: 'scheme', name: 'Scheme', allowedOrigins: ['https://scheme.test'] },
    ])).toHaveLength(1)
  })

  it('uses a remembered accessible choice before unique automatic matching', () => {
    expect(resolveProjectSelection('https://app.example.com', projects, {})).toBeNull()
    expect(resolveProjectSelection('https://app.example.com', projects, {
      'app.example.com': { publicKey: 'app', name: 'Old name' },
    })).toEqual({ publicKey: 'app', name: 'App' })
    expect(resolveProjectSelection('https://shop.example.com', projects, {})).toEqual({ publicKey: 'store', name: 'Store' })
    expect(resolveProjectSelection('https://shop.example.com', projects, { 'shop.example.com': null })).toBeNull()
    expect(resolveProjectSelection('chrome://settings', projects, {})).toBeNull()
  })

  it('persists automatic, manual, and private page choices', async () => {
    await expect(resolveProjectForPage('https://shop.example.com/products', projects)).resolves.toEqual({ publicKey: 'store', name: 'Store' })
    expect(storageState[hostProjectStorageKey('shop.example.com')]).toMatchObject({ publicKey: 'store' })
    expect(await getActiveProject()).toBeNull()
    await setActiveProject(null)
    expect(local.remove).not.toHaveBeenCalled()

    await setProjectForPage('https://shop.example.com', { publicKey: 'other', name: 'Other' })
    await expect(resolveProjectForPage('https://shop.example.com/cart', projects)).resolves.toEqual({ publicKey: 'other', name: 'Other' })

    await setProjectForPage('https://shop.example.com', null)
    await expect(resolveProjectForPage('https://shop.example.com', projects)).resolves.toBeNull()
    expect(storageState[hostProjectStorageKey('shop.example.com')]).toBeNull()
  })

  it('drops inaccessible preferences and handles active state idempotently', async () => {
    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'other.test': { publicKey: 'gone', name: 'Gone' } }
    await expect(resolveProjectForPage('https://other.test', projects)).resolves.toEqual({ publicKey: 'other', name: 'Other' })
    expect(storageState[hostProjectStorageKey('other.test')]).toEqual({ publicKey: 'other', name: 'Other' })
    await setActiveProject({ publicKey: 'other', name: 'Other' })
    const calls = local.set.mock.calls.length
    await setActiveProject({ publicKey: 'other', name: 'Other' })
    expect(local.set).toHaveBeenCalledTimes(calls)
    await setActiveProject(null)
    expect(storageState[ACTIVE_PROJECT_STORAGE_KEY]).toBeUndefined()
  })

  it('removes an inaccessible preference when its page has no automatic match', async () => {
    await expect(resolveProjectForPage('https://missing.test', projects)).resolves.toBeNull()
    expect(local.remove).not.toHaveBeenCalled()
    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'unknown.test': { publicKey: 'gone', name: 'Gone' } }
    await expect(resolveProjectForPage('https://unknown.test', projects)).resolves.toBeNull()
    expect(storageState[hostProjectStorageKey('unknown.test')]).toBeUndefined()
    expect(local.remove).toHaveBeenCalledWith(hostProjectStorageKey('unknown.test'))
  })

  it('ignores malformed legacy hostname preferences', async () => {
    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'unknown.test': { publicKey: 42 } }
    await expect(resolveProjectForPage('https://unknown.test', projects)).resolves.toBeNull()
    expect(local.set).not.toHaveBeenCalled()
  })

  it('migrates a legacy hostname preference once without rewriting stable resolutions', async () => {
    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'shop.example.com': { publicKey: 'store', name: 'Old store' } }
    await expect(resolveProjectForPage('https://shop.example.com', projects)).resolves.toEqual({ publicKey: 'store', name: 'Store' })
    expect(storageState[hostProjectStorageKey('shop.example.com')]).toEqual({ publicKey: 'store', name: 'Old store' })
    const writes = local.set.mock.calls.length
    await expect(resolveProjectForPage('https://shop.example.com', projects)).resolves.toEqual({ publicKey: 'store', name: 'Store' })
    expect(local.set).toHaveBeenCalledTimes(writes)

    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'private.test': null }
    await expect(resolveProjectForPage('https://private.test', projects)).resolves.toBeNull()
    expect(storageState[hostProjectStorageKey('private.test')]).toBeNull()
  })

  it('stores concurrent hostname choices independently', async () => {
    await Promise.all([
      setProjectForPage('https://shop.example.com', { publicKey: 'store', name: 'Store' }),
      setProjectForPage('https://other.test', { publicKey: 'other', name: 'Other' }),
    ])
    expect(storageState[hostProjectStorageKey('shop.example.com')]).toEqual({ publicKey: 'store', name: 'Store' })
    expect(storageState[hostProjectStorageKey('other.test')]).toEqual({ publicKey: 'other', name: 'Other' })
    expect(storageState[ACTIVE_PROJECT_STORAGE_KEY]).toBeUndefined()
  })

  it('does not write global or hostname state for unsupported pages', async () => {
    await expect(resolveProjectForPage('chrome://settings', projects)).resolves.toBeNull()
    await setProjectForPage('not a page', { publicKey: 'store', name: 'Store' })
    expect(local.set).not.toHaveBeenCalled()
  })

  it('reads the current regular tab URL only', async () => {
    tabs.query.mockResolvedValueOnce([{ url: 'https://example.com/path' }])
    await expect(getCurrentTabUrl()).resolves.toBe('https://example.com/path')
    tabs.query.mockResolvedValueOnce([{ url: 'chrome://settings' }])
    await expect(getCurrentTabUrl()).resolves.toBeNull()
  })
})
