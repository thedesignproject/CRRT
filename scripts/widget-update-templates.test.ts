// @vitest-environment node
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

const root = 'apps/landing/public/widget-updates/assets/'
const yaml = (name: string) => JSON.parse(execFileSync('bun', ['-e',
  'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
  root + name], { encoding: 'utf8' }))
const workflow = yaml('patch-auto-merge.yml')
const script = workflow.jobs.enable.steps[1].with.script
const run = new (Object.getPrototypeOf(async function () {}).constructor)(
  'github', 'context', 'core', script,
)
const fixture = () => ({
  autoMergeAllowed: true,
  squashMergeAllowed: true,
  defaultBranchRef: { name: 'trunk', branchProtectionRule: {
    requiresStatusChecks: true, requiredStatusCheckContexts: ['tests', 'build'],
  } },
  pullRequest: {
    id: 'PR_123', state: 'OPEN', isDraft: false, headRefOid: 'abc123',
    baseRefName: 'trunk', author: { __typename: 'Bot', login: 'dependabot' },
    headRepository: { nameWithOwner: 'customer/site' }, autoMergeRequest: null,
  },
})
const context = { repo: { owner: 'customer', repo: 'site' }, payload: {
  pull_request: { number: 123, head: { sha: 'abc123' } },
} }
async function execute(repo: unknown) {
  const graphql = vi.fn().mockResolvedValueOnce({ repository: repo }).mockResolvedValueOnce({})
  await run({ graphql }, context, { notice: vi.fn() })
  return graphql
}

describe('consumer update templates', () => {
  it('limits new scheduled updates to CRRT without enabling merge', () => {
    const config = yaml('dependabot.yml')
    expect(config.version).toBe(2)
    expect(config.updates).toHaveLength(1)
    expect(config.updates[0].allow).toEqual([{ 'dependency-name': '@thedesignproject/crrt' }])
    expect(config.updates[0].schedule.interval).toBe('daily')
  })

  it('requires opt-in and trusted bot events; never executes PR code', () => {
    expect(workflow.permissions).toEqual({})
    expect(workflow.jobs.enable.if).toContain("vars.CRRT_AUTO_UPDATE_PATCHES == 'true'")
    expect(workflow.jobs.enable.if).toContain("github.event.sender.login == 'dependabot[bot]'")
    expect(workflow.jobs.enable.steps[1].if).toContain("dependency-names == '@thedesignproject/crrt'")
    expect(workflow.jobs.enable.steps[1].if).toContain("update-type == 'version-update:semver-patch'")
    for (const step of workflow.jobs.enable.steps) {
      expect(step.uses).toMatch(/^(dependabot\/fetch-metadata|actions\/github-script)@[a-f0-9]{40}$/)
      expect(step.run).toBeUndefined()
    }
    expect(readFileSync(root + 'patch-auto-merge.yml', 'utf8')).not.toContain('actions/checkout')
  })

  it('requests native auto-merge tied to the verified head; never directly merges', async () => {
    const api = await execute(fixture())
    expect(api).toHaveBeenCalledTimes(2)
    expect(api.mock.calls[1][0]).toContain('enablePullRequestAutoMerge')
    expect(api.mock.calls[1][0]).toContain('expectedHeadOid: $head')
    expect(api.mock.calls[1][1]).toEqual({ id: 'PR_123', head: 'abc123' })
  })

  it.each([
    ['auto-merge disabled', { autoMergeAllowed: false }],
    ['squash disabled', { squashMergeAllowed: false }],
    ['missing default branch', { defaultBranchRef: null }],
    ['ruleset-only protection', { defaultBranchRef: { name: 'trunk', branchProtectionRule: null } }],
    ['optional checks', { defaultBranchRef: { name: 'trunk', branchProtectionRule: { requiresStatusChecks: false } } }],
    ['no named checks', { defaultBranchRef: { name: 'trunk', branchProtectionRule: { requiresStatusChecks: true, requiredStatusCheckContexts: [] } } }],
  ])('keeps manual review: %s', async (_name, changes) => {
    expect(await execute({ ...fixture(), ...changes })).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['closed', { state: 'CLOSED' }], ['draft', { isDraft: true }],
    ['already queued', { autoMergeRequest: { enabledAt: 'today' } }],
    ['not bot', { author: { __typename: 'User', login: 'dependabot' } }],
    ['other bot', { author: { __typename: 'Bot', login: 'other' } }], ['deleted author', { author: null }],
    ['fork', { headRepository: { nameWithOwner: 'other/site' } }],
    ['deleted fork', { headRepository: null }],
    ['other target', { baseRefName: 'release' }], ['stale event', { headRefOid: 'new-sha' }],
  ])('does not enable merge for %s PR', async (_name, changes) => {
    const repo = fixture()
    expect(await execute({ ...repo, pullRequest: { ...repo.pullRequest, ...changes } }))
      .toHaveBeenCalledTimes(1)
  })

  it('does not attempt a mutation when verification fails', async () => {
    const graphql = vi.fn().mockRejectedValue(new Error('Permission denied'))
    await expect(run({ graphql }, context, { notice: vi.fn() })).rejects.toThrow('Permission denied')
    expect(graphql).toHaveBeenCalledTimes(1)
  })
})
