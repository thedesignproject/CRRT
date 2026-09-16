import { beforeEach, describe, expect, it, vi } from 'vitest'

const sandbox = vi.hoisted(() => ({ create: vi.fn(), runCommand: vi.fn(), stop: vi.fn() }))
vi.mock('@vercel/sandbox', () => ({ Sandbox: { create: sandbox.create } }))

import { DockerAuditExplorer, FixtureAuditExplorer, runDockerExplorer, SandboxAuditExplorer } from './explorer.js'

const target = { url: 'https://example.com/', origin: 'https://example.com', hostname: 'example.com', addresses: ['8.8.8.8'] }
const demoTarget = { url: 'https://demo.crrt.ai/', origin: 'https://demo.crrt.ai', hostname: 'demo.crrt.ai', addresses: [] }
const budgets = { maxRoutes: 5, maxActions: 20, wallClockMs: 30_000, modelTokens: 1_000, maxArtifacts: 10 }

beforeEach(() => {
  vi.clearAllMocks()
  sandbox.create.mockResolvedValue({ runCommand: sandbox.runCommand, stop: sandbox.stop })
  sandbox.stop.mockResolvedValue(undefined)
})

describe('audit explorers', () => {
  it('returns deterministic evidence only for the exact demo hostname', async () => {
    const explorer = new FixtureAuditExplorer()
    const known = await explorer.explore(demoTarget)
    expect(known.evidence.length).toBeGreaterThan(1)
    expect(known.evidence[0]).toMatchObject({ source: 'url', provenance: { collector: 'fixture-explorer' } })
    expect(known.coverage.unavailableSources).toEqual(['customer-rule', 'design-system', 'repository'])
    await expect(explorer.explore(target)).rejects.toThrow('fixture_target_not_allowed')
  })

  it('collects observable response evidence inside a Sandbox and always stops it', async () => {
    sandbox.runCommand.mockResolvedValue({ exitCode: 0, stdout: vi.fn().mockResolvedValue(JSON.stringify({ pages: [{ url: target.url, status: 200, title: 'Home', text: 'Visible', links: [], formCount: 1, controlCount: 2 }] })) })
    const result = await new SandboxAuditExplorer().explore(target, budgets)
    expect(sandbox.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: budgets.wallClockMs }))
    expect(result.evidence[0]).toMatchObject({ kind: 'network', direct: false, capture: { status: 200 } })
    expect(result.evidence[1]).toMatchObject({ kind: 'observable', direct: true, observation: expect.stringContaining('Visible') })
    expect(result.coverage).toMatchObject({ routesAttempted: 1, routesEvaluated: 1 })
    expect(sandbox.stop).toHaveBeenCalled()
  })

  it('collects the same evidence contract inside a locked-down local Docker container', async () => {
    const output = JSON.stringify({ pages: [{ url: target.url, status: 200, title: 'Home', text: 'Visible', links: [], formCount: 1, controlCount: 2 }] })
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: output, stderr: '' })
    const result = await new DockerAuditExplorer(run).explore(target, budgets)
    expect(result.evidence[0]).toMatchObject({ provenance: { collector: 'local-docker' }, capture: { formCount: 1 } })
    expect(run).toHaveBeenCalledWith(target, budgets)

    const failed = new DockerAuditExplorer(vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'container failed' }))
    await expect(failed.explore(target, budgets)).rejects.toThrow('container failed')
    const emptyError = new DockerAuditExplorer(vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: ' ' }))
    await expect(emptyError.explore(target, budgets)).rejects.toThrow('docker_explorer_failed')

    const execute = vi.fn((_file, _args, _options, callback) => callback(null, '{"pages":[]}', ''))
    await expect(runDockerExplorer(target, budgets, execute)).resolves.toMatchObject({ exitCode: 0 })
    expect(execute).toHaveBeenCalledWith('docker', expect.arrayContaining(['--read-only', '--cap-drop', 'ALL', '--env', 'TARGET_ADDRESSES=["8.8.8.8"]', 'node:24-alpine']), expect.objectContaining({ timeout: budgets.wallClockMs }), expect.any(Function))
    const failedExecute = vi.fn((_file, _args, _options, callback) => callback(new Error('failed'), '', 'docker failed'))
    await expect(runDockerExplorer(target, budgets, failedExecute)).resolves.toEqual({ exitCode: 1, stdout: '', stderr: 'docker failed' })
  })

  it('reports partial zero-evidence coverage and safely fails malformed commands', async () => {
    sandbox.runCommand.mockResolvedValueOnce({ exitCode: 0, stdout: vi.fn().mockResolvedValue('{"pages":[]}') })
    await expect(new SandboxAuditExplorer().explore(target, budgets)).resolves.toMatchObject({ coverage: { partialReason: 'One or more public routes could not be evaluated.' } })
    sandbox.runCommand.mockResolvedValueOnce({ exitCode: 1, stdout: vi.fn().mockResolvedValue('') })
    await expect(new SandboxAuditExplorer().explore(target, budgets)).rejects.toThrow('sandbox_explorer_failed')
    expect(sandbox.stop).toHaveBeenCalledTimes(2)
  })

  it('describes untitled and failed routes without inventing page claims', async () => {
    sandbox.runCommand.mockResolvedValue({ exitCode: 0, stdout: vi.fn().mockResolvedValue(JSON.stringify({ pages: [
      { url: 'https://example.com/missing', status: 404, title: '', text: '', links: [], formCount: 0, controlCount: 0 },
      { url: 'https://example.com/failed', status: 0, title: '', text: '', links: [], formCount: 0, controlCount: 0, failed: true },
    ] })) })
    const result = await new SandboxAuditExplorer().explore(target, budgets)
    expect(result.evidence[0].observation).toBe('The route returned HTTP 404.')
    expect(result.evidence[1].observation).toBe('The route could not be fetched safely.')
    expect(result.coverage).toMatchObject({ routesEvaluated: 0, partialReason: expect.any(String) })
  })
})
