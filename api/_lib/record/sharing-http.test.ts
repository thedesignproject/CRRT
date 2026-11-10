import { afterEach, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
const owner = vi.hoisted(() => ({ changeShare: vi.fn(), ownerShare: vi.fn(), ownerPlayback: vi.fn() }))
vi.mock('./sharing.js', () => ({ readShare: read, ...owner }))
vi.mock('../auth.js', () => ({ requireUser: async () => ({ userId: 'owner' }) }))
import share from '../../v1/recording-shares/[token]'
import change from '../../v1/recordings/[id]/share'
import playback from '../../v1/recordings/[id]/playback'
import { RecordError } from './core'
function req(method: string) { return { method, query: { token: 'a'.repeat(43), id: 'd775b075-6cc7-4d8f-b922-2eea57c9fbb5' }, headers: {} } as any }
function res() { const r: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }; r.status.mockReturnValue(r); return r }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
it('handles public share methods, activation and safe failure responses', async () => {
  let r = res(); await share(req('OPTIONS'), r); expect(r.status).toHaveBeenCalledWith(204)
  r = res(); await share(req('GET'), r); expect(r.status).toHaveBeenCalledWith(503)
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  r = res(); await share(req('POST'), r); expect(r.status).toHaveBeenCalledWith(405)
  read.mockResolvedValue({ recording: {} }); r = res(); await share(req('GET'), r); expect(r.status).toHaveBeenCalledWith(200)
  for (const error of [new RecordError('record_not_found', 404), new Error('private detail')]) {
    read.mockRejectedValue(error); r = res(); await share(req('GET'), r); expect(r.status).toHaveBeenCalledWith(error instanceof RecordError ? 404 : 503)
  }
})
it('authorizes owner share rotation, revocation and playback renewal', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  await change(req('GET'), res()); await change(req('POST'), res()); await change(req('DELETE'), res()); await playback(req('GET'), res())
  expect(owner.ownerShare).toHaveBeenCalledOnce()
  expect(owner.changeShare).toHaveBeenCalledTimes(2); expect(owner.ownerPlayback).toHaveBeenCalledOnce()
})
