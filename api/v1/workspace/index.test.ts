import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../_lib/store.js', () => ({ getWorkspaceName: vi.fn(), setWorkspaceName: vi.fn() }))

import handler from './index.js'
import { requireUser } from '../../_lib/auth.js'
import { getWorkspaceName, setWorkspaceName } from '../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader() {},
  }
}
async function call(method: string, body?: unknown) {
  const res = mockRes()
  await (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)({ method, body, query: {}, headers: {} }, res)
  return res
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'a@b.c' })
  vi.mocked(getWorkspaceName).mockReset()
  vi.mocked(setWorkspaceName).mockReset().mockResolvedValue()
})

it('answers preflight and rejects other methods', async () => {
  expect((await call('OPTIONS')).statusCode).toBe(204)
  expect((await call('DELETE')).statusCode).toBe(405)
})

it('stops when the user is not signed in', async () => {
  vi.mocked(requireUser).mockImplementation(async (_req, res) => {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  })
  expect((await call('GET')).statusCode).toBe(401)
  expect(getWorkspaceName).not.toHaveBeenCalled()
})

it('returns the signed-in user\'s workspace name', async () => {
  vi.mocked(getWorkspaceName).mockResolvedValueOnce(null)
  const res = await call('GET')
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ name: null })
  expect(getWorkspaceName).toHaveBeenCalledWith('u')
})

it('saves a trimmed name for the signed-in user', async () => {
  const res = await call('PUT', { name: '  Acme  ' })
  expect(res.statusCode).toBe(200)
  expect(res.body).toEqual({ name: 'Acme' })
  expect(setWorkspaceName).toHaveBeenCalledWith('u', 'Acme')
})

it('rejects a missing, blank, non-string or too long name', async () => {
  for (const body of [undefined, {}, { name: '   ' }, { name: 5 }, { name: 'x'.repeat(61) }]) {
    const res = await call('PUT', body)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Workspace name must be 1 to 60 characters' })
  }
  expect((await call('PUT', { name: 'x'.repeat(60) })).statusCode).toBe(200)
  expect(setWorkspaceName).toHaveBeenCalledTimes(1)
})

it('returns 500 when the store fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getWorkspaceName).mockRejectedValueOnce(new Error('boom'))
  expect((await call('GET')).statusCode).toBe(500)
})
