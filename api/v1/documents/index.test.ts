// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/documents.js', async original => ({ ...await original<object>(), executeDocument: vi.fn() }))
import { requireUser } from '../../_lib/auth.js'
import { DocumentError, executeDocument } from '../../_lib/documents.js'
import handler from './index.js'
beforeEach(() => vi.resetAllMocks())
async function call(method = 'POST', authorized = false) {
  const req = { method, headers: authorized ? { authorization: 'Bearer token' } : {}, body: {} }
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn(), setHeader: vi.fn() }
  await handler(req as never, res as never); return res
}
it('handles preflight and method restrictions', async () => {
  expect((await call('OPTIONS')).status).toHaveBeenCalledWith(204)
  expect((await call('GET')).status).toHaveBeenCalledWith(405)
})
it('authenticates optional sessions and forwards successful requests', async () => {
  vi.mocked(executeDocument).mockResolvedValue({ id: 'id' })
  expect((await call()).json).toHaveBeenCalledWith({ id: 'id' })
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u', email: 'u@test.local' })
  expect((await call('POST',true)).status).toHaveBeenCalledWith(200)
  vi.mocked(requireUser).mockResolvedValue(null); vi.mocked(executeDocument).mockClear()
  await call('POST',true); expect(executeDocument).not.toHaveBeenCalled()
})
it('returns public errors without exposing infrastructure details', async () => {
  for (const [error, status, message] of [[new DocumentError(409,'version_conflict'),409,'version_conflict'], [new z.ZodError([]),400,'invalid_request'], [new Error('secret'),503,'document_unavailable']] as const) {
    vi.mocked(executeDocument).mockRejectedValue(error)
    const response = await call(); expect(response.status).toHaveBeenCalledWith(status); expect(response.json).toHaveBeenCalledWith({ error: message })
  }
})
