import { createSign } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const tokenUrl = 'https://oauth2.googleapis.com/token'
const scope = 'https://www.googleapis.com/auth/chromewebstore'

// Exchange a locally signed JWT directly with Google's OAuth endpoint. This
// needs no federation, impersonation, or extra Token Creator project/IAM roles.
export async function getAccessToken(credentials, expectedEmail, request = fetch, now = Date.now()) {
  if (credentials.type !== 'service_account' || !expectedEmail || credentials.client_email !== expectedEmail) {
    throw new Error('Secret must contain the configured service account JSON key')
  }
  const issuedAt = Math.floor(now / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const message = `${encode({ alg: 'RS256', typ: 'JWT', kid: credentials.private_key_id })}.${encode({
    iss: credentials.client_email, scope, aud: tokenUrl, iat: issuedAt, exp: issuedAt + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(message).sign(credentials.private_key, 'base64url')
  const response = await request(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${message}.${signature}`,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Google OAuth token exchange failed (HTTP ${response.status})`)
  const result = await response.json()
  if (typeof result.access_token !== 'string' || !/^[\x21-\x7e]+$/.test(result.access_token)) {
    throw new Error('Google OAuth response did not contain a valid access token')
  }
  return result.access_token
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const token = await getAccessToken(JSON.parse(process.env.CWS_SERVICE_ACCOUNT_KEY), process.env.CWS_SERVICE_ACCOUNT)
    console.log(`::add-mask::${token}`)
    appendFileSync(process.env.GITHUB_OUTPUT, `access_token=${token}\n`)
  } catch {
    // Parser/crypto exceptions may include key material. Keep credentials out of logs.
    console.error('Service account authentication failed. Check the JSON secret, configured account, key validity, and Chrome Web Store API enablement.')
    process.exitCode = 1
  }
}
