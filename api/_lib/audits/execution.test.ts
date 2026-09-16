import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('workflow/api', () => ({ getRun: vi.fn(), start: vi.fn() }))
vi.mock('./config.js', () => ({ auditLocalExecution: vi.fn() }))
vi.mock('./pipeline.js', () => ({ executeAuditPipeline: vi.fn() }))

import { getRun, start } from 'workflow/api'
import { auditLocalExecution } from './config.js'
import { cancelAuditExecution, startAuditExecution } from './execution.js'
import { executeAuditPipeline } from './pipeline.js'
import { PRODUCT_AUDIT_WORKFLOW_ID } from '../../../workflows/product-audit-id.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auditLocalExecution).mockReturnValue(false)
  vi.mocked(executeAuditPipeline).mockResolvedValue(undefined)
})

describe('audit workflow execution adapter', () => {
  it('starts and cancels durable provider runs', async () => {
    vi.mocked(start).mockResolvedValue({ runId: 'run-id' } as never)
    await expect(startAuditExecution('audit', 'live')).resolves.toBe('run-id')
    await expect(startAuditExecution('fixture', 'local-fixture')).resolves.toBe('run-id')
    expect(start).toHaveBeenCalledWith({ workflowId: PRODUCT_AUDIT_WORKFLOW_ID }, ['audit'])
    expect(start).toHaveBeenLastCalledWith(expect.anything(), ['fixture'])
    const cancel = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getRun).mockReturnValue({ cancel } as never)
    await cancelAuditExecution('run-id')
    expect(cancel).toHaveBeenCalled()
    await cancelAuditExecution(null)
    await cancelAuditExecution('local-live-audit')
    expect(getRun).toHaveBeenCalledTimes(1)
  })

  it('runs live stages inline under the local API adapter', async () => {
    vi.mocked(auditLocalExecution).mockReturnValue(true)
    await expect(startAuditExecution('audit', 'live')).resolves.toBe('local-live-audit')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
    expect(executeAuditPipeline).toHaveBeenCalledWith('audit')
    expect(start).not.toHaveBeenCalled()
    vi.mocked(executeAuditPipeline).mockRejectedValueOnce(new Error('safe failure'))
    await startAuditExecution('second', 'local-fixture')
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
  })
})
