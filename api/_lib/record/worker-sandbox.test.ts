import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({ ...fs, default: fs }))
vi.mock('@vercel/sandbox', () => ({ Sandbox: { create: vi.fn(), get: vi.fn(), list: vi.fn() } }))
import { readFile } from 'node:fs/promises'
import { Sandbox } from '@vercel/sandbox'
import { launchRecordWorker, recordWorkerStatus, stopRecordWorker } from './worker-sandbox.js'

const vm = { name: 'worker-vm', writeFiles: vi.fn(), runCommand: vi.fn(), getCommand: vi.fn(), stop: vi.fn() }
const session = { name: 'worker-vm', commandId: 'command-1' }
function sessions(values: { status: string; createdAt?: number }[]) {
  vi.mocked(Sandbox.list).mockResolvedValue({ async *[Symbol.asyncIterator]() {
    yield* values.map(value => ({ createdAt: Date.now(), ...value }))
  } } as never)
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VERCEL_PROJECT_ID', 'project-1')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'private-service-key')
  vi.stubEnv('VERCEL_OIDC_TOKEN', 'private-vercel-token')
  vi.stubEnv('UNRELATED_SECRET', 'unrelated-key')
  vi.mocked(readFile).mockResolvedValue(Buffer.from('worker-source'))
  vi.mocked(Sandbox.create).mockResolvedValue(vm as never)
  vi.mocked(Sandbox.get).mockResolvedValue(vm as never)
  vm.runCommand.mockResolvedValue({ cmdId: 'command-1' })
  vm.getCommand.mockResolvedValue({ exitCode: null })
  sessions([])
})
afterEach(() => vi.unstubAllEnvs())

it('launches the packaged worker with only its environment and a hard VM deadline', async () => {
  expect(await launchRecordWorker()).toEqual(session)
  expect(Sandbox.list).toHaveBeenCalledWith({ namePrefix: expect.stringMatching(/^crrt-record-[a-f0-9]{16}-$/), sortBy: 'name', sortOrder: 'desc' })
  expect(Sandbox.create).toHaveBeenCalledWith(expect.objectContaining({
    name: expect.stringMatching(/^crrt-record-[a-f0-9]{16}-\d+$/),
    image: 'vercel/sandbox/node:22', persistent: false, resources: { vcpus: 1 }, timeout: 1_800_000,
  }))
  expect(vm.writeFiles).toHaveBeenCalledWith([{ path: 'record-worker.mjs', content: Buffer.from('worker-source') }])
  const command = vm.runCommand.mock.calls[0][0]
  expect(command).toMatchObject({ cmd: 'bash', detached: true, env: { CRRT_RECORD_ENABLED: 'true', SUPABASE_SECRET_KEY: 'private-service-key' } })
  expect(command.args[1]).toContain('ffmpeg')
  expect(command.args[1]).toContain('exec node record-worker.mjs --once')
  expect(command.env).not.toHaveProperty('VERCEL_OIDC_TOKEN')
  expect(command.env).not.toHaveProperty('UNRELATED_SECRET')
  expect(vm.stop).not.toHaveBeenCalled()
})

it.each(['VERCEL_PROJECT_ID', 'VERCEL_ENV'])('refuses launch without %s', async key => {
  vi.stubEnv(key, '')
  await expect(launchRecordWorker()).rejects.toThrow('record_worker_environment_missing')
  expect(Sandbox.create).not.toHaveBeenCalled()
})

it.each(['pending', 'running', 'stopping'])('does not launch while an existing VM is %s', async status => {
  sessions([{ status }])
  expect(await launchRecordWorker()).toBeNull()
  expect(Sandbox.create).not.toHaveBeenCalled()
})

it('ignores stopped sessions when launching new work', async () => {
  sessions([{ status: 'stopped' }])
  expect(await launchRecordWorker()).toEqual(session)
})
it('uses the Sandbox API sorting required by a name prefix filter', async () => {
  vi.mocked(Sandbox.list).mockImplementationOnce(async options => {
    if (options?.namePrefix && options.sortBy !== 'name') {
      throw new Error('Invalid request: namePrefix is only valid when sortBy is name')
    }
    return { async *[Symbol.asyncIterator]() {} } as never
  })
  expect(await launchRecordWorker()).toEqual(session)
})
it('does not paginate through historical sessions beyond the hard deadline', async () => {
  sessions([{ status: 'stopped', createdAt: Date.now() - 32 * 60_000 }, { status: 'running' }])
  expect(await launchRecordWorker()).toEqual(session)
})

it('does not allocate a VM if its bundle is missing', async () => {
  vi.mocked(readFile).mockRejectedValueOnce(new Error('missing-bundle'))
  await expect(launchRecordWorker()).rejects.toThrow('missing-bundle')
  expect(Sandbox.create).not.toHaveBeenCalled()
})

it.each(['writeFiles', 'runCommand'] as const)('stops the VM after a %s failure', async method => {
  vm[method].mockRejectedValueOnce(new Error('launch-failed'))
  await expect(launchRecordWorker()).rejects.toThrow('launch-failed')
  expect(vm.stop).toHaveBeenCalledOnce()
})

it('polls detached command status and stops the selected VM', async () => {
  expect(await recordWorkerStatus(session)).toBeNull()
  vm.getCommand.mockResolvedValueOnce({ exitCode: 0 })
  expect(await recordWorkerStatus(session)).toBe(0)
  expect(Sandbox.get).toHaveBeenCalledWith({ name: 'worker-vm' })
  expect(vm.getCommand).toHaveBeenCalledWith('command-1')
  await stopRecordWorker(session)
  expect(vm.stop).toHaveBeenCalledOnce()
})
