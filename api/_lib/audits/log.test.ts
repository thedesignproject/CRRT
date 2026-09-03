import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditErrorLogFields, auditServerLog } from './log.js'

afterEach(() => vi.restoreAllMocks())

describe('audit server logging', () => {
  it('emits structured levels while redacting secrets and bounding collections', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    auditServerLog('info', 'stage.completed', { auditId: 'audit', values: Array.from({ length: 25 }, (_, index) => index) })
    auditServerLog('warn', 'model.failed', { authorization: 'Bearer secret', message: 'Bearer hidden' })
    auditServerLog('error', 'run.failed', { apiKey: 'sk-secret', message: 'vck_abcdef' })
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"stage.completed"'))
    expect(info.mock.calls[0][0]).not.toContain('24]')
    expect(warn.mock.calls[0][0]).toContain('Bearer [REDACTED]')
    expect(warn.mock.calls[0][0]).not.toContain('secret')
    expect(error.mock.calls[0][0]).not.toContain('sk-secret')
    expect(error.mock.calls[0][0]).not.toContain('vck_abcdef')
  })

  it('serializes typed, generic, and unknown errors without leaking provider credentials', () => {
    const typed = Object.assign(new Error('provider failed with Bearer private'), {
      name: 'AuditModelError', code: 'provider', retryAfterMs: 1_000,
      context: { httpStatus: 503, providerMessage: 'vck_private', token: 'secret' },
    })
    expect(auditErrorLogFields(typed)).toEqual(expect.objectContaining({
      errorName: 'AuditModelError', errorCode: 'provider', retryAfterMs: 1_000,
      provider: expect.objectContaining({ httpStatus: 503, providerMessage: '[REDACTED]', token: '[REDACTED]' }),
    }))
    expect(auditErrorLogFields('failed')).toEqual({ errorName: 'UnknownError', errorMessage: 'failed' })
  })
})
