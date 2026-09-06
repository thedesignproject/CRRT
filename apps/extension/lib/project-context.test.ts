import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageState = vi.hoisted(() => ({} as Record<string, unknown>))
const local = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
const tabs = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { storage: { local }, tabs } }))

import {
  ACTIVE_PROJECT_STORAGE_KEY,
  getActiveProject,
  getCurrentTabUrl,
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
  local.get.mockImplementation(async (key: string) => ({ [key]: storageState[key] }))
  local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(storageState, values) })
  local.remove.mockImplementation(async (key: string) => { delete storageState[key] })
})

describe('extension project context', () => {
  it('normalizes pages and finds exact or parent-domain projects', () => {
    expect(normalizePageHostname('https://Shop.Example.com./products#x')).toBe('shop.example.com')
    expect(normalizePageHostname('chrome://settings')).toBeNull()
    expect(normalizePageHostname('bad')).toBeNull()
    expect(matchingProjects('https://app.example.com', projects).map((project) => project.publicKey)).toEqual(['store', 'app'])
    expect(matchingProjects('https://shop.example.com', projects).map((project) => project.publicKey)).toEqual(['store'])
  })

  it('uses a remembered accessible choice before unique automatic matching', () => {
    expect(resolveProjectSelection('https://app.example.com', projects, {})).toBeNull()
    expect(resolveProjectSelection('https://app.example.com', projects, {
      'app.example.com': { publicKey: 'app', name: 'Old name' },
    })).toEqual({ publicKey: 'app', name: 'App' })
    expect(resolveProjectSelection('https://shop.example.com', projects, {})).toEqual({ publicKey: 'store', name: 'Store' })
    expect(resolveProjectSelection('https://shop.example.com', projects, { 'shop.example.com': null })).toBeNull()
  })

  it('persists automatic, manual, and private page choices', async () => {
    await expect(resolveProjectForPage('https://shop.example.com/products', projects)).resolves.toEqual({ publicKey: 'store', name: 'Store' })
    expect(storageState[HOST_PROJECTS_STORAGE_KEY]).toMatchObject({ 'shop.example.com': { publicKey: 'store' } })
    expect(await getActiveProject()).toEqual({ publicKey: 'store', name: 'Store' })

    await setProjectForPage('https://shop.example.com', { publicKey: 'other', name: 'Other' })
    await expect(resolveProjectForPage('https://shop.example.com/cart', projects)).resolves.toEqual({ publicKey: 'other', name: 'Other' })

    await setProjectForPage('https://shop.example.com', null)
    await expect(resolveProjectForPage('https://shop.example.com', projects)).resolves.toBeNull()
    expect(storageState[HOST_PROJECTS_STORAGE_KEY]).toMatchObject({ 'shop.example.com': null })
  })

  it('drops inaccessible preferences and handles active state idempotently', async () => {
    storageState[HOST_PROJECTS_STORAGE_KEY] = { 'other.test': { publicKey: 'gone', name: 'Gone' } }
    await expect(resolveProjectForPage('https://other.test', projects)).resolves.toEqual({ publicKey: 'other', name: 'Other' })
    expect(storageState[HOST_PROJECTS_STORAGE_KEY]).toEqual({ 'other.test': { publicKey: 'other', name: 'Other' } })
    await setActiveProject({ publicKey: 'other', name: 'Other' })
    const calls = local.set.mock.calls.length
    await setActiveProject({ publicKey: 'other', name: 'Other' })
    expect(local.set).toHaveBeenCalledTimes(calls)
    await setActiveProject(null)
    expect(storageState[ACTIVE_PROJECT_STORAGE_KEY]).toBeUndefined()
  })

  it('reads the current regular tab URL only', async () => {
    tabs.query.mockResolvedValueOnce([{ url: 'https://example.com/path' }])
    await expect(getCurrentTabUrl()).resolves.toBe('https://example.com/path')
    tabs.query.mockResolvedValueOnce([{ url: 'chrome://settings' }])
    await expect(getCurrentTabUrl()).resolves.toBeNull()
  })
})
