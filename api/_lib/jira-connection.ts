import { decryptToken, encryptToken } from './tokens.js'
import { refreshJiraToken } from './jira.js'
import { updateProjectIntegrationTokens } from './store.js'

type StoredJiraIntegration = {
  id: string
  accessTokenCiphertext: string
  refreshTokenCiphertext: string | null
  tokenExpiresAt: string | null
}

export async function getJiraAccessToken(integration: StoredJiraIntegration) {
  const expiresAt = integration.tokenExpiresAt ? Date.parse(integration.tokenExpiresAt) : Number.POSITIVE_INFINITY
  if (expiresAt > Date.now() + 60_000) return decryptToken(integration.accessTokenCiphertext)
  if (!integration.refreshTokenCiphertext) throw new Error('jira_reauthorization_required')
  const tokens = await refreshJiraToken(decryptToken(integration.refreshTokenCiphertext))
  await updateProjectIntegrationTokens({
    id: integration.id,
    accessTokenCiphertext: encryptToken(tokens.accessToken),
    refreshTokenCiphertext: tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : integration.refreshTokenCiphertext,
    tokenExpiresAt: tokens.expiresAt,
  })
  return tokens.accessToken
}
