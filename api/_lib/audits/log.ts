type AuditLogLevel = 'info' | 'warn' | 'error'

const secretKey = /(?:authorization|api.?key|capability|secret|token)/i
const secretText = /(Bearer\s+)[^\s]+|\b(?:sk|vck|vercel)_[A-Za-z0-9_-]+/gi

function sanitizeText(value: string) {
  return value.slice(0, 500).replace(secretText, (_match, bearerPrefix: string | undefined) => bearerPrefix ? `${bearerPrefix}[REDACTED]` : '[REDACTED]')
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && secretKey.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return sanitizeText(value)
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)]))
  }
  return value
}

export function auditErrorLogFields(error: unknown) {
  if (error instanceof Error) {
    const detail = error as Error & { code?: unknown; context?: unknown; retryAfterMs?: unknown }
    return sanitizeValue({
      errorName: error.name,
      errorMessage: error.message,
      ...(typeof detail.code === 'string' ? { errorCode: detail.code } : {}),
      ...(typeof detail.retryAfterMs === 'number' ? { retryAfterMs: detail.retryAfterMs } : {}),
      ...(detail.context && typeof detail.context === 'object' ? { provider: detail.context } : {}),
    }) as Record<string, unknown>
  }
  return { errorName: 'UnknownError', errorMessage: sanitizeText(String(error)) }
}

export function auditServerLog(level: AuditLogLevel, event: string, fields: Record<string, unknown> = {}) {
  const entry = sanitizeValue({ timestamp: new Date().toISOString(), scope: 'product-audit', event, ...fields })
  const line = `[product-audit] ${JSON.stringify(entry)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
