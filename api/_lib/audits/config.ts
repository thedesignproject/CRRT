import { auditBudgetsSchema, type AuditBudgets } from '../../../shared/product-audit/contracts.js'

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true'
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export function auditCapabilities(env = process.env) {
  const auditEnabled = enabled(env.AUDIT_FEATURE_ENABLED)
  return {
    enabled: auditEnabled,
    anonymousEnabled: auditEnabled && enabled(env.AUDIT_ANONYMOUS_ENABLED),
    authenticatedEnabled: auditEnabled,
  }
}

export function auditBudgets(env = process.env): AuditBudgets {
  return auditBudgetsSchema.parse({
    maxRoutes: boundedInteger(env.AUDIT_MAX_ROUTES, 5, 1, 20),
    maxActions: boundedInteger(env.AUDIT_MAX_ACTIONS, 20, 1, 100),
    wallClockMs: boundedInteger(env.AUDIT_WALL_CLOCK_MS, 300_000, 1_000, 900_000),
    modelTokens: boundedInteger(env.AUDIT_MODEL_TOKENS, 8_000, 256, 100_000),
    maxArtifacts: boundedInteger(env.AUDIT_MAX_ARTIFACTS, 10, 0, 100),
  })
}

export function auditModelConfig(env = process.env, stage: 'critic' | 'verifier' = 'verifier') {
  const baseUrl = env.AI_API_BASE_URL?.trim() || 'https://api.openai.com/v1'
  const apiKey = env.AI_API_KEY?.trim()
  const defaultModel = env.AI_MODEL?.trim()
  const model = stage === 'critic' ? env.AI_CRITIC_MODEL?.trim() || defaultModel : defaultModel
  const url = new URL(baseUrl)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && local)) {
    throw new Error('invalid_audit_model_base_url')
  }
  if (!apiKey || !defaultModel || !model) throw new Error('missing_audit_model_config')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  url.search = ''
  url.hash = ''
  return {
    endpoint: url.toString(),
    apiKey,
    model,
    maxTokens: auditBudgets(env).modelTokens,
    timeoutMs: boundedInteger(env.AUDIT_MODEL_TIMEOUT_MS, 45_000, 1_000, 120_000),
    attempts: boundedInteger(env.AUDIT_MODEL_ATTEMPTS, 3, 1, 5),
  }
}

export function auditLocalExecution(env = process.env) {
  return env.NODE_ENV !== 'production' && enabled(env.AUDIT_LOCAL_EXECUTION)
}

export function auditLocalAccess(env = process.env) {
  return env.NODE_ENV !== 'production' && enabled(env.AUDIT_LOCAL_ACCESS_BYPASS)
}

export function auditTokenSecret(env = process.env) {
  const secret = env.AUDIT_TOKEN_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('missing_audit_token_secret')
  return secret
}
