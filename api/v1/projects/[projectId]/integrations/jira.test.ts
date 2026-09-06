import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../_lib/auth.js', () => ({ requireUser: vi.fn() }))
vi.mock('../../../../_lib/jira-connection.js', () => ({ getJiraAccessToken: vi.fn() }))
vi.mock('../../../../_lib/jira.js', () => ({
  buildJiraAuthorizeUrl: vi.fn(() => 'https://auth.atlassian.com/authorize?state=signed'),
  createJiraOAuthState: vi.fn(() => 'signed'),
  getJiraDestinations: vi.fn(),
}))
vi.mock('../../../../_lib/store.js', () => ({
  deleteProjectIntegration: vi.fn(),
  getProjectIntegration: vi.fn(),
  getProjectMember: vi.fn(),
  updateProjectIntegrationWorkspaceDestination: vi.fn(),
}))

import handler from './jira.js'
import { requireUser } from '../../../../_lib/auth.js'
import { getJiraAccessToken } from '../../../../_lib/jira-connection.js'
import { createJiraOAuthState, getJiraDestinations } from '../../../../_lib/jira.js'
import {
  deleteProjectIntegration,
  getProjectIntegration,
  getProjectMember,
  updateProjectIntegrationWorkspaceDestination,
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
  id: 'integration', projectKey: 'p', provider: 'jira' as const,
  accessTokenCiphertext: 'ciphertext', refreshTokenCiphertext: 'refresh', tokenExpiresAt: null,
  workspaceId: 'cloud', workspaceName: 'Acme Jira', containerId: '100', containerName: 'WEB · Website',
  createdBy: 'u', createdAt: new Date(), updatedAt: new Date(),
}
const destination = {
  id: 'cloud:100', cloudId: 'cloud', siteName: 'Acme Jira', siteUrl: 'https://acme.atlassian.net',
  projectId: '100', projectKey: 'WEB', projectName: 'Website',
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ userId: 'u', email: 'u@example.com' })
  vi.mocked(getProjectMember).mockReset().mockResolvedValue({ role: 'admin' } as never)
  vi.mocked(getProjectIntegration).mockReset()
  vi.mocked(getJiraAccessToken).mockReset().mockResolvedValue('access')
  vi.mocked(getJiraDestinations).mockReset().mockResolvedValue([destination])
  vi.mocked(updateProjectIntegrationWorkspaceDestination).mockReset()
  vi.mocked(deleteProjectIntegration).mockReset()
  vi.mocked(createJiraOAuthState).mockClear()
})

describe('Jira project integration API', () => {
  it('requires an admin and starts an origin-bound OAuth flow', async () => {
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
    expect(res.body).toEqual({ authorizeUrl: 'https://auth.atlassian.com/authorize?state=signed' })
    expect(createJiraOAuthState).toHaveBeenCalledWith(expect.objectContaining({
      projectKey: 'p', userId: 'u', origin: 'https://app.crrt.test',
    }))
  })

  it('returns authorized projects and persists a validated selection', async () => {
    vi.mocked(getProjectIntegration).mockResolvedValue(integration as never)
    let res = mockRes()
    await call({ method: 'GET', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.body).toMatchObject({
      connected: true, workspace: 'Acme Jira', selectedDestinationId: 'cloud:100',
      destinations: [{ id: 'cloud:100', name: 'Acme Jira · WEB · Website' }],
    })

    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { containerId: 'unknown' }, headers: {} }, res)
    expect(res.statusCode).toBe(400)

    vi.mocked(getProjectIntegration).mockResolvedValue(integration as never)
    res = mockRes()
    await call({ method: 'PATCH', query: { projectId: 'p' }, body: { containerId: 'cloud:100' }, headers: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(updateProjectIntegrationWorkspaceDestination).toHaveBeenCalledWith({
      projectKey: 'p', provider: 'jira', workspaceId: 'cloud', workspaceName: 'Acme Jira',
      containerId: '100', containerName: 'WEB · Website',
    })
  })

  it('disconnects Jira from the project', async () => {
    const res = mockRes()
    await call({ method: 'DELETE', query: { projectId: 'p' }, headers: {} }, res)
    expect(res.statusCode).toBe(204)
    expect(deleteProjectIntegration).toHaveBeenCalledWith('p', 'jira')
  })
})
