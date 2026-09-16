import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./tokens.js', () => ({ decryptToken: vi.fn((value: string) => `plain:${value}`), encryptToken: vi.fn((value: string) => `cipher:${value}`) }))
vi.mock('./jira.js', () => ({ refreshJiraToken: vi.fn() }))
vi.mock('./store.js', () => ({ updateProjectIntegrationTokens: vi.fn() }))

import { getJiraAccessToken } from './jira-connection.js'
import { refreshJiraToken } from './jira.js'
import { updateProjectIntegrationTokens } from './store.js'

const integration = {
  id: 'integration', accessTokenCiphertext: 'access', refreshTokenCiphertext: 'refresh',
  tokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
}

beforeEach(() => vi.clearAllMocks())

describe('getJiraAccessToken', () => {
  it('decrypts a still-valid token, including non-expiring records', async () => {
    await expect(getJiraAccessToken(integration)).resolves.toBe('plain:access')
    await expect(getJiraAccessToken({ ...integration, tokenExpiresAt: null })).resolves.toBe('plain:access')
    expect(refreshJiraToken).not.toHaveBeenCalled()
  })

  it('requires reauthorization when an expired token cannot refresh', async () => {
    await expect(getJiraAccessToken({ ...integration, tokenExpiresAt: new Date(0).toISOString(), refreshTokenCiphertext: null }))
      .rejects.toThrow('jira_reauthorization_required')
  })

  it('refreshes and persists rotating and retained refresh tokens', async () => {
    vi.mocked(refreshJiraToken)
      .mockResolvedValueOnce({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: 'later' })
      .mockResolvedValueOnce({ accessToken: 'newer-access', refreshToken: null, expiresAt: null })

    await expect(getJiraAccessToken({ ...integration, tokenExpiresAt: new Date(0).toISOString() })).resolves.toBe('new-access')
    expect(updateProjectIntegrationTokens).toHaveBeenLastCalledWith({
      id: 'integration', accessTokenCiphertext: 'cipher:new-access', refreshTokenCiphertext: 'cipher:new-refresh', tokenExpiresAt: 'later',
    })

    await expect(getJiraAccessToken({ ...integration, tokenExpiresAt: new Date(0).toISOString() })).resolves.toBe('newer-access')
    expect(updateProjectIntegrationTokens).toHaveBeenLastCalledWith({
      id: 'integration', accessTokenCiphertext: 'cipher:newer-access', refreshTokenCiphertext: 'refresh', tokenExpiresAt: null,
    })
  })
})
