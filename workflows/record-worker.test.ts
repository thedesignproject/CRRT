import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('workflow', () => ({ sleep: vi.fn() }))
vi.mock('../api/_lib/record/worker-sandbox.js', () => ({ launchRecordWorker: vi.fn(), recordWorkerStatus: vi.fn(), stopRecordWorker: vi.fn() }))
import { sleep } from 'workflow'
import { launchRecordWorker, recordWorkerStatus, stopRecordWorker } from '../api/_lib/record/worker-sandbox.js'
import { recordWorkerWorkflow } from './record-worker.js'

const session = { name: 'worker-vm', commandId: 'command-1' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(launchRecordWorker).mockResolvedValue(session)
  vi.mocked(recordWorkerStatus).mockResolvedValue(0)
})
it('polls a detached worker and stops the VM after success', async () => {
  vi.mocked(recordWorkerStatus).mockResolvedValueOnce(null)
  await recordWorkerWorkflow()
  expect(sleep).toHaveBeenCalledWith(10_000)
  expect(recordWorkerStatus).toHaveBeenCalledTimes(2)
  expect(stopRecordWorker).toHaveBeenCalledWith(session)
})
it('skips an overlapping workflow without stopping the other worker', async () => {
  vi.mocked(launchRecordWorker).mockResolvedValue(null)
  await recordWorkerWorkflow()
  expect(recordWorkerStatus).not.toHaveBeenCalled()
  expect(stopRecordWorker).not.toHaveBeenCalled()
})
it('stops the VM and exposes a safe failure after a failed process', async () => {
  vi.mocked(recordWorkerStatus).mockResolvedValue(100)
  await expect(recordWorkerWorkflow()).rejects.toThrow('record_worker_failed exit_code=100')
  expect(stopRecordWorker).toHaveBeenCalledWith(session)
})
it('stops the VM after a status error', async () => {
  vi.mocked(recordWorkerStatus).mockRejectedValue(new Error('status-failed'))
  await expect(recordWorkerWorkflow()).rejects.toThrow('status-failed')
  expect(stopRecordWorker).toHaveBeenCalledWith(session)
})
it('bounds waiting and stops a hung worker', async () => {
  vi.mocked(recordWorkerStatus).mockResolvedValue(null)
  await expect(recordWorkerWorkflow()).rejects.toThrow('record_worker_timeout')
  expect(sleep).toHaveBeenCalledTimes(180)
  expect(stopRecordWorker).toHaveBeenCalledWith(session)
})
it('does not try to stop a VM when launch failed before returning a session', async () => {
  vi.mocked(launchRecordWorker).mockRejectedValue(new Error('launch-failed'))
  await expect(recordWorkerWorkflow()).rejects.toThrow('launch-failed')
  expect(stopRecordWorker).not.toHaveBeenCalled()
})
