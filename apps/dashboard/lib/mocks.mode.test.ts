import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadMocks(mode?: string) {
  vi.resetModules()
  if (mode === undefined) vi.unstubAllEnvs()
  else vi.stubEnv('VITE_USE_MOCKS', mode)
  return import('./mocks')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('dashboard mock modes', () => {
  it('keeps populated fixtures in the default preview mode', async () => {
    const mocks = await loadMocks('1')

    expect(mocks.mocksEnabled).toBe(true)
    expect(mocks.mocksEmpty).toBe(false)
    expect(mocks.mocksOnboarding).toBe(false)
    expect(mocks.getMockProjects()).not.toHaveLength(0)
    expect(mocks.getMockComments('proj_acme_marketing')).not.toHaveLength(0)
  })

  it('keeps a project but removes feedback in onboarding mode', async () => {
    const mocks = await loadMocks('onboarding')

    expect(mocks.mocksEnabled).toBe(true)
    expect(mocks.mocksEmpty).toBe(false)
    expect(mocks.mocksOnboarding).toBe(true)
    expect(mocks.getMockProjects()).not.toHaveLength(0)
    expect(mocks.getMockComments('proj_acme_marketing')).toEqual([])
  })

  it('keeps the existing empty-account and real-api modes', async () => {
    const empty = await loadMocks('empty')
    expect(empty.mocksEnabled).toBe(true)
    expect(empty.mocksEmpty).toBe(true)
    expect(empty.getMockProjects()).toEqual([])

    const real = await loadMocks()
    expect(real.mocksEnabled).toBe(false)
    expect(real.mocksEmpty).toBe(false)
    expect(real.mocksOnboarding).toBe(false)
  })
})
