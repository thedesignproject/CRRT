import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../auth.js', () => ({ requireUser: async () => ({ userId: 'owner' }) }))
const services = vi.hoisted(() => ({ authorizeUpload: vi.fn(), completeArtifact: vi.fn(), finalizeRecording: vi.fn(), deleteRecording: vi.fn() }))
vi.mock('./storage.js', () => services)
import upload from '../../v1/recordings/[id]/uploads'
import complete from '../../v1/recordings/[id]/complete'
import finalize from '../../v1/recordings/[id]/finalize'
import item from '../../v1/recordings/[id]/index'
const part = vi.hoisted(() => vi.fn())
vi.mock('./multipart.js', () => ({ authorizePart: part }))
import uploadPart from '../../v1/recordings/[id]/upload-parts'
afterEach(() => vi.unstubAllEnvs())
it('routes storage and deletion operations through owner authorization', async () => {
  vi.stubEnv('CRRT_RECORD_ENABLED', 'true')
  const id = '551321a6-b904-46cd-a042-bfae5ab5596b'
  for (const [handler, method] of [[upload, 'POST'], [complete, 'POST'], [finalize, 'POST'], [item, 'DELETE']] as const) {
    const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res)
    await handler({ method, query: { id }, body: { artifactId: id }, headers: {} } as any, res)
    expect(res.status).toHaveBeenCalledWith(200)
  }
  for (const service of Object.values(services)) expect(service).toHaveBeenCalled()
  const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res)
  await uploadPart({ method: 'POST', query: { id }, body: { artifactId: id, partNumber: 1 }, headers: {} } as any, res)
  expect(part).toHaveBeenCalledWith('owner', id, { artifactId: id, partNumber: 1 })
})
