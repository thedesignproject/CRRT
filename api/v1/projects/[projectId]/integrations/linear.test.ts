import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/linear-connection.js', () => ({ getLinearAccessToken: vi.fn() }))
vi.mock('../../../../_lib/linear.js', () => ({
  buildLinearAuthorizeUrl: vi.fn(() => 'https://linear.app/oauth/authorize?state=signed'),
  createLinearOAuthState: vi.fn(() => 'signed'),
  getLinearWorkspace: vi.fn(),
}))
vi.mock('../../../../_lib/store.js', () => ({
  deleteProjectIntegration: vi.fn(),
  getProjectIntegration: vi.fn(),
  getProjectMember: vi.fn(),
  updateProjectIntegrationDestination: vi.fn(),
}))

import handler from './linear.js'
import { requireUser } from '../../../../_lib/auth.js'
import { getLinearAccessToken } from '../../../../_lib/linear-connection.js'
import { createLinearOAuthState, getLinearWorkspace } from '../../../../_lib/linear.js'
import {
  deleteProjectIntegration,
  getProjectIntegration,
  getProjectMember,
  updateProjectIntegrationDestination,
} from '../../../../_lib/store.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    end() { return this },
    setHeader(key: string, value: string) { this.headers[key] = value },
  }
}
const call = (req: unknown, res: unknown) =>
  (handler as unknown as (req: unknown, res: unknown) => Promise<unknown>)(req, res)

const integration = {
  id: 'integration', projectKey: 'p', provider: 'linear' as const,
  accessTokenCiphertext: 'ciphertext', refreshTokenCiphertext: 'refresh', tokenExpiresAt: null,
  workspaceId: 'workspace', workspaceName: 'Acme', containerId: 'web', containerName: 'WEB · Website',
  createdBy: 'u', createdAt: new Date(), updatedAt: new Date(),
}
const workspace = {
  id: 'workspace', name: 'Acme',
  teams: [{ id: 'web', key: 'WEB', name: 'Website' }, { id: 'product', key: 'PROD', name: 'Product' }],
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'u@example.com' })
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'admin' } as never)
  vi.mocked(getProjectIntegration).mockReset()
  vi.mocked(getLinearAccessToken).mockReset().mockResolvedValue('access')
  vi.mocked(getLinearWorkspace).mockReset().mockResolvedValue(workspace)
  vi.mocked(updateProjectIntegrationDestination).mockReset()
  vi.mocked(deleteProjectIntegration).mockReset()
  vi.mocked(createLinearOAuthState).mockClear()
})

describe('Linear project integration API', () => {
  it('requires an admin and returns an authorization URL without exposing credentials', async () => {
    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'member' } as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(403)

    vi.mocked(getProjectMember).mockResolvedValueOnce({ role: 'admin' } as never)
    res = mockRes()
    await call({
      method: 'GET', query: { projectId: 'p', action: 'authorize' },
      headers: { origin: 'https://app.crrt.test', host: 'api.crrt.test' },
    }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ authorizeUrl: 'https://linear.app/oauth/authorize?state=signed' })
    expect(createLinearOAuthState).toHaveBeenCalledWith(expect.objectContaining({
      projectKey: 'p', userId: 'u', origin: 'https://app.crrt.test',
    }))
    expect(JSON.stringify(res.body)).not.toContain('access')
  })

  it('returns connection state and validates team changes', async () => {
    vi.mocked(getProjectIntegration).mockResolvedValue(integration as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.body).toMatchObject({ connected: true, workspace: 'Acme', selectedDestinationId: 'web' })
    expect((res.body as { destinations: unknown[] }).destinations).toContainEqual({ id: 'web', name: 'WEB · Website' })

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { containerId: 'unknown' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectIntegration).mockResolvedValueOnce(integration as never).mockResolvedValueOnce({
      ...integration, containerId: 'product', containerName: 'PROD · Product',
    } as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { containerId: 'product' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(updateProjectIntegrationDestination).toHaveBeenCalledWith('p', 'linear', 'product', 'PROD · Product')
    expect(res.body).toMatchObject({ connected: true, selectedDestinationId: 'product' })
  })

  it('disconnects without returning integration data', async () => {
    const res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
    expect(deleteProjectIntegration).toHaveBeenCalledWith('p', 'linear')
  })
})
