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

  it('previews Brain rules, next steps and past runs with data, and no rules for an empty account', async () => {
    const mocks = await loadMocks('1')
    expect(mocks.getMockRules().map((rule) => rule.projectKey)).toEqual([null, 'proj_acme_marketing'])
    const [step] = mocks.getMockNextSteps('proj_acme_marketing')
    expect(step.status).toBe('paused')
    // A step only shows while its comments are ready, so it must point at a ready mock comment.
    expect(mocks.getMockComments('proj_acme_marketing').find((c) => c.id === step.comments[0].id)?.reviewStatus).toBe('accepted')
    expect(mocks.getMockNextSteps('proj_dashboard_v2')).toEqual([])
    expect(mocks.getMockAgentRuns('proj_acme_marketing').map((run) => run.outcome)).toEqual(['blocked', 'completed'])
    expect(mocks.getMockAgentRuns('proj_dashboard_v2')).toEqual([])
    expect((await loadMocks('empty')).getMockRules()).toEqual([])
  })
})
