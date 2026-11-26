import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerNextStepConflict, createRule, deleteProject, deleteRule, getProjectTrackers, getWorkspace,listAgentRuns, listNextSteps, listRules, renameWorkspace, updateRule } from './api'

afterEach(() => vi.unstubAllGlobals())

const json = { 'Content-Type': 'application/json', Authorization: 'Bearer token' }
function reply(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('workspace, Brain, next steps and agent runs API', () => {
  it('reads and renames the workspace', async () => {
    const fetch = reply({ name: 'Acme' })
    await expect(getWorkspace('/api', 'token')).resolves.toEqual({ name: 'Acme' })
    expect(fetch).toHaveBeenCalledWith('/api/v1/workspace', { headers: { Authorization: 'Bearer token' } })
    await renameWorkspace('/api', 'token', 'Acme')
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/workspace', { method: 'PUT', headers: json, body: JSON.stringify({ name: 'Acme' }) })
  })

  it('lists, creates, updates and deletes rules', async () => {
    let fetch = reply({ rules: ['r'] })
    await expect(listRules('/api', 'token')).resolves.toEqual(['r'])
    expect(fetch).toHaveBeenCalledWith('/api/v1/rules', { headers: { Authorization: 'Bearer token' } })
    fetch = reply({ rule: 'created' }, 201)
    await expect(createRule('/api', 'token', { title: 'T', body: 'B', projectKey: null })).resolves.toBe('created')
    expect(fetch).toHaveBeenCalledWith('/api/v1/rules', { method: 'POST', headers: json, body: JSON.stringify({ title: 'T', body: 'B', projectKey: null }) })
    fetch = reply({ rule: 'updated' })
    await expect(updateRule('/api', 'token', 'r/1', { title: 'T', body: 'B' })).resolves.toBe('updated')
    expect(fetch).toHaveBeenCalledWith('/api/v1/rules/r%2F1', { method: 'PATCH', headers: json, body: JSON.stringify({ title: 'T', body: 'B' }) })
    fetch = reply(undefined, 204)
    await expect(deleteRule('/api', 'token', 'r/1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/v1/rules/r%2F1', { method: 'DELETE', headers: { Authorization: 'Bearer token' } })
  })

  it('keeps the status on a refused delete', async () => {
    reply({ error: 'Forbidden' }, 403)
    await expect(deleteRule('/api', 'token', 'r1')).rejects.toMatchObject({ message: 'Forbidden', status: 403 })
  })

  it('reads which trackers a project has connected', async () => {
    const trackers = { github: { connected: true }, linear: { connected: false }, jira: { connected: false } }
    const fetch = reply(trackers)
    await expect(getProjectTrackers('/api', 'token', 'p/1')).resolves.toEqual(trackers)
    expect(fetch).toHaveBeenCalledWith('/api/v1/projects/p%2F1/integrations', { headers: { Authorization: 'Bearer token' } })
  })

  it('deletes a project and keeps the status when refused', async () => {
    const fetch = reply(undefined, 204)
    await expect(deleteProject('/api', 'token', 'p/1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/v1/projects/p%2F1', { method: 'DELETE', headers: { Authorization: 'Bearer token' } })
    reply({ error: 'Only the project owner can delete it' }, 403)
    await expect(deleteProject('/api', 'token', 'p')).rejects.toMatchObject({ message: 'Only the project owner can delete it', status: 403 })
  })

  it('lists next steps, answers a conflict and lists agent runs', async () => {
    let fetch = reply({ steps: ['s'] })
    await expect(listNextSteps('/api', 'token', 'p/1')).resolves.toEqual(['s'])
    expect(fetch).toHaveBeenCalledWith('/api/v1/projects/p%2F1/next-steps', { headers: { Authorization: 'Bearer token' } })
    fetch = reply({ step: 'answered' })
    await expect(answerNextStepConflict('/api', 'token', 's/1', 'keep_rule')).resolves.toBe('answered')
    expect(fetch).toHaveBeenCalledWith('/api/v1/next-steps/s%2F1/conflict', { method: 'POST', headers: json, body: JSON.stringify({ decision: 'keep_rule' }) })
    fetch = reply({ runs: ['run'] })
    await expect(listAgentRuns('/api', 'token', 'p/1')).resolves.toEqual(['run'])
    expect(fetch).toHaveBeenCalledWith('/api/v1/agent-runs?project=p%2F1&limit=20', { headers: { Authorization: 'Bearer token' } })
  })
})
