import { describe, expect, it } from 'vitest'
import { auditBudgets, auditCapabilities, auditLocalAccess, auditLocalExecution, auditModelConfig, auditTokenSecret } from './config.js'
import { createAuditCapability, createOrVerifyAuditSession, hashAuditCapability, hashAuditIp } from './tokens.js'

const secret = 's'.repeat(32)

describe('audit configuration and tokens', () => {
  it('keeps capabilities disabled by default and gates anonymous mode', () => {
    expect(auditCapabilities({})).toEqual({ enabled: false, anonymousEnabled: false, authenticatedEnabled: false })
    expect(auditCapabilities({ AUDIT_FEATURE_ENABLED: ' TRUE ', AUDIT_ANONYMOUS_ENABLED: 'true' })).toEqual({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true })
  })

  it('bounds budgets and execution mode', () => {
    expect(auditBudgets({ AUDIT_MAX_ROUTES: '10', AUDIT_MAX_ACTIONS: 'bad', AUDIT_MAX_ARTIFACTS: '0' })).toMatchObject({ maxRoutes: 10, maxActions: 20, maxArtifacts: 0 })
    expect(auditBudgets({ AUDIT_MAX_ROUTES: '99' }).maxRoutes).toBe(5)
    expect(auditLocalExecution({ NODE_ENV: 'development', AUDIT_LOCAL_EXECUTION: 'true' })).toBe(true)
    expect(auditLocalExecution({ NODE_ENV: 'production', AUDIT_LOCAL_EXECUTION: 'true' })).toBe(false)
    expect(auditLocalAccess({ NODE_ENV: 'development', AUDIT_LOCAL_ACCESS_BYPASS: 'true' })).toBe(true)
    expect(auditLocalAccess({ NODE_ENV: 'production', AUDIT_LOCAL_ACCESS_BYPASS: 'true' })).toBe(false)
  })

  it('validates model endpoints and required configuration', () => {
    expect(auditModelConfig({ AI_API_KEY: 'key', AI_MODEL: 'model' })).toMatchObject({ endpoint: 'https://api.openai.com/v1/chat/completions', attempts: 3, maxTokens: 8000, model: 'model' })
    expect(auditModelConfig({ AI_API_KEY: 'key', AI_MODEL: 'model', AI_CRITIC_MODEL: 'critic-model' }, 'critic').model).toBe('critic-model')
    expect(auditModelConfig({ AI_API_KEY: 'key', AI_MODEL: 'model', AI_CRITIC_MODEL: '  ' }, 'critic').model).toBe('model')
    expect(auditModelConfig({ NODE_ENV: 'test', AI_API_BASE_URL: 'http://localhost:11434/v1/', AI_API_KEY: 'k', AI_MODEL: 'm', AUDIT_MODEL_ATTEMPTS: '2' }).endpoint).toBe('http://localhost:11434/v1/chat/completions')
    expect(() => auditModelConfig({ AI_API_BASE_URL: 'http://example.com', AI_API_KEY: 'k', AI_MODEL: 'm' })).toThrow('invalid_audit_model_base_url')
    expect(() => auditModelConfig({})).toThrow('missing_audit_model_config')
    expect(() => auditModelConfig({ AI_API_KEY: 'key', AI_CRITIC_MODEL: 'critic-only' }, 'critic')).toThrow('missing_audit_model_config')
  })

  it('signs sessions, hashes IPs, and derives stable per-request capabilities', () => {
    const env = { AUDIT_TOKEN_SECRET: secret }
    expect(auditTokenSecret(env)).toBe(secret)
    expect(() => auditTokenSecret({ AUDIT_TOKEN_SECRET: 'short' })).toThrow()
    const first = createOrVerifyAuditSession(undefined, env)
    expect(first.created).toBe(true)
    expect(createOrVerifyAuditSession(first.token, env)).toEqual({ ...first, created: false })
    expect(createOrVerifyAuditSession(`${first.token}x`, env).created).toBe(true)
    const capability = createAuditCapability(`${first.hash}:request`, env)
    expect(createAuditCapability(`${first.hash}:request`, env)).toEqual(capability)
    expect(hashAuditCapability(capability.token)).toBe(capability.hash)
    expect(createAuditCapability().token).not.toHaveLength(0)
    expect(hashAuditIp(' 203.0.113.10 ', env)).toBe(hashAuditIp('203.0.113.10', env))
  })
})
