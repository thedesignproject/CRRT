import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { test } from 'node:test'
import { getAccessToken } from './chrome-store-auth.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const email = 'test@example.iam.gserviceaccount.com'
const credentials = {
  type: 'service_account', client_email: email, private_key_id: 'test-key',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}

test('signs and exchanges a Chrome-scoped JWT without trusting JSON endpoint URLs', async () => {
  const token = await getAccessToken({ ...credentials, token_uri: 'https://untrusted.invalid' }, email, async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    assert.equal(options.method, 'POST')
    assert.equal(options.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [header, payload, signature] = options.body.get('assertion').split('.')
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT', kid: 'test-key' })
    assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
      iss: email, scope: 'https://www.googleapis.com/auth/chromewebstore',
      aud: url, iat: 1000, exp: 4600,
    })
    assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true)
    return { ok: true, json: async () => ({ access_token: 'test-token' }) }
  }, 1000000)
  assert.equal(token, 'test-token')
})

test('rejects incorrect credentials before sending a request', async () => {
  for (const candidate of [{ ...credentials, type: 'authorized_user' }, { ...credentials, client_email: 'other' }]) {
    await assert.rejects(getAccessToken(candidate, email, () => assert.fail('must not call Google')), /configured service account/)
  }
  await assert.rejects(getAccessToken(credentials, ''), /configured service account/)
})

test('propagates token exchange failures without returning a token', async () => {
  await assert.rejects(getAccessToken(credentials, email, async () => ({ ok: false, status: 401 })), /HTTP 401/)
  await assert.rejects(getAccessToken(credentials, email, async () => { throw new Error('network failure') }), /network failure/)
  for (const access_token of [undefined, '', 'bad\ninjection']) {
    await assert.rejects(getAccessToken(credentials, email, async () => ({ ok: true, json: async () => ({ access_token }) })), /valid access token/)
  }
})
