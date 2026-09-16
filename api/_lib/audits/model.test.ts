import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AuditCandidate, AuditEvidence } from '../../../shared/product-audit/contracts.js'
import { AuditModelError, AuditModelRateLimitError, FakeAuditModel, OpenAiCompatibleAuditModel, runCritic, runVerifier } from './model.js'

const evidence: AuditEvidence[] = [{ id: 'e', source: 'url', signalKey: 's', location: '/', observation: 'Observed', confidence: 1, direct: true }]
const candidate: AuditCandidate = { id: 'c', kind: 'problem', title: 'Problem', summary: 'Summary', impact: 'high', confidence: .95, evidenceIds: ['e'], recommendation: 'Fix' }
const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.unstubAllGlobals()
})

function configure(attempts = '2') {
  Object.assign(process.env, { AI_API_BASE_URL: 'https://models.example/v1', AI_API_KEY: 'secret', AI_MODEL: 'verifier-model', AI_CRITIC_MODEL: 'critic-model', AUDIT_MODEL_ATTEMPTS: attempts })
}

describe('audit model adapters', () => {
  it('validates fake Critic and Verifier outputs', async () => {
    const model = new FakeAuditModel({ critic: { candidates: [candidate] }, verifier: { decisions: [{ candidateId: 'c', admitted: true, contradictions: [] }] } })
    await expect(runCritic(model, evidence)).resolves.toEqual([candidate])
    await expect(runVerifier(model, [candidate], evidence)).resolves.toEqual([{ candidateId: 'c', admitted: true, contradictions: [] }])
    await expect(runCritic(new FakeAuditModel({ critic: { candidates: [{ nope: true }] }, verifier: {} }), evidence)).rejects.toThrow()
  })

  it('rejects duplicate Critic identifiers and incomplete Verifier decisions', async () => {
    const duplicateEvidence = { ...candidate, evidenceIds: ['e', 'e'] }
    await expect(runCritic(new FakeAuditModel({ critic: { candidates: [duplicateEvidence] }, verifier: {} }), evidence)).rejects.toThrow('Evidence IDs must be unique')
    await expect(runCritic(new FakeAuditModel({ critic: { candidates: [candidate, candidate] }, verifier: {} }), evidence)).rejects.toThrow('Candidate IDs must be unique')

    const secondCandidate = { ...candidate, id: 'c2' }
    for (const decisions of [
      [{ candidateId: 'c', admitted: true, contradictions: [] }, { candidateId: 'c', admitted: false, contradictions: ['duplicate'] }],
      [{ candidateId: 'c', admitted: true, contradictions: [] }],
      [{ candidateId: 'c2', admitted: true, contradictions: [] }, { candidateId: 'c', admitted: true, contradictions: [] }],
      [{ candidateId: 'c', admitted: true, contradictions: [] }, { candidateId: 'unknown', admitted: true, contradictions: [] }],
    ]) {
      await expect(runVerifier(new FakeAuditModel({ critic: {}, verifier: { decisions } }), [candidate, secondCandidate], evidence)).rejects.toThrow()
    }
  })

  it('bounds captured page text sent to both model stages', async () => {
    const longEvidence = [
      { ...evidence[0], provenance: { collector: 'sandbox', target: 'https://example.com/?token=secret', traceId: 'trace' }, capture: { textExcerpt: 'x'.repeat(3_000), status: 200 } },
      { ...evidence[0], id: 'non-text-capture', capture: { textExcerpt: 42 } },
    ]
    const model = { generate: vi.fn()
      .mockResolvedValueOnce({ candidates: [candidate] })
      .mockResolvedValueOnce({ decisions: [{ candidateId: 'c', admitted: true, contradictions: [] }] }) }
    await runCritic(model, longEvidence)
    await runVerifier(model, [candidate], longEvidence)
    expect(model.generate).toHaveBeenNthCalledWith(1, 'critic', expect.objectContaining({
      evidence: [expect.objectContaining({ capture: { textExcerpt: 'x'.repeat(2_000), status: 200 } }), expect.objectContaining({ capture: { textExcerpt: 42 } })],
    }), expect.anything(), undefined, undefined)
    expect(model.generate).toHaveBeenNthCalledWith(2, 'verifier', expect.objectContaining({
      evidence: [expect.objectContaining({ capture: { textExcerpt: 'x'.repeat(2_000), status: 200 } }), expect.objectContaining({ capture: { textExcerpt: 42 } })],
    }), expect.anything(), undefined, undefined)
    const sent = model.generate.mock.calls[0][1] as { evidence: AuditEvidence[] }
    expect(sent.evidence[0].provenance).toEqual({ collector: 'sandbox', traceId: 'trace' })
    expect(sent.evidence[0]).toMatchObject({ id: 'e', source: 'url', observation: 'Observed', direct: true })
  })

  it('selects evidence deterministically under the provider cap and preserves required evidence', async () => {
    const manyEvidence = Array.from({ length: 20 }, (_, index): AuditEvidence => ({
      ...evidence[0],
      id: `e-${index}`,
      confidence: 1 - index / 100,
      direct: index !== 0,
      observation: `${index}-${'o'.repeat(1_800)}`,
      capture: { textExcerpt: 'x'.repeat(3_000) },
    }))
    const requiredCandidate = { ...candidate, evidenceIds: ['e-19'] }
    const model = { generate: vi.fn()
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ decisions: [{ candidateId: 'c', admitted: true, contradictions: [] }] }) }

    await runCritic(model, manyEvidence)
    await runVerifier(model, [requiredCandidate], manyEvidence)

    const criticInput = model.generate.mock.calls[0][1] as { evidence: AuditEvidence[] }
    const verifierInput = model.generate.mock.calls[1][1] as { evidence: AuditEvidence[] }
    expect(JSON.stringify(criticInput).length).toBeLessThanOrEqual(30_000)
    expect(JSON.stringify(verifierInput).length).toBeLessThanOrEqual(30_000)
    expect(criticInput.evidence.length).toBeLessThan(manyEvidence.length)
    expect(criticInput.evidence[0].id).toBe('e-1')
    expect(verifierInput.evidence[0].id).toBe('e-19')
  })

  it('fails safely when required Verifier evidence cannot fit the model input', async () => {
    const model = { generate: vi.fn() }
    await expect(runVerifier(model, [candidate], [{ ...evidence[0], observation: 'x'.repeat(31_000) }])).rejects.toMatchObject({
      code: 'budget', context: { stage: 'verifier', reason: 'required_evidence_exceeds_input_limit', validationIssues: ['e'] },
    })
    expect(model.generate).not.toHaveBeenCalled()
  })

  it('sends separate schema-bounded provider calls and returns valid JSON', async () => {
    configure('1')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [candidate] }) } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).resolves.toEqual([candidate])
    expect(fetchMock).toHaveBeenCalledWith('https://models.example/v1/chat/completions', expect.objectContaining({ method: 'POST', redirect: 'error' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ model: 'critic-model', max_completion_tokens: 8000, response_format: { type: 'json_schema' } })
    expect(body.messages[0].content).toContain('The following JSON Schema is authoritative')
    expect(body.messages[0].content).toContain(JSON.stringify(body.response_format.json_schema.schema))
    expect(body.messages[0].content).toContain('Example structure only; never copy')
    expect(body.messages[0].content).toContain('aim to return 1 to 5 distinct, defensible candidates')
    expect(body.messages[0].content).toContain('Never invent a candidate to meet a count')
    expect(body.messages[0].content).toContain('{"candidates":[]}')
    expect(body).not.toHaveProperty('providerOptions')
  })

  it('preserves and logs sanitized provider failure context for a run', async () => {
    configure()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      error: { code: 'upstream_unavailable', message: 'Provider could not serve vck_private' },
    }), { status: 503, headers: { 'x-ai-gateway-request-id': 'gateway-request' } })))
    vi.stubGlobal('fetch', fetchMock)
    const failure = await runCritic(new OpenAiCompatibleAuditModel(), evidence, undefined, undefined, 'audit-id').catch((error) => error)
    expect(failure).toMatchObject({
      code: 'provider',
      context: {
        auditId: 'audit-id', stage: 'critic', attempt: 2, attempts: 2, model: 'critic-model',
        reason: 'http_error', httpStatus: 503, providerCode: 'upstream_unavailable',
        providerMessage: 'Provider could not serve vck_private', requestId: 'gateway-request',
      },
    } satisfies Partial<AuditModelError>)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toContain('model.attempt_failed')
    expect(warn.mock.calls[0][0]).not.toContain('vck_private')
  })

  it('logs successful stage completion only when an audit context is supplied', async () => {
    configure('1')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [candidate] }) } }] }), { status: 200 })))
    await runCritic(new OpenAiCompatibleAuditModel(), evidence, undefined, undefined, 'audit-id')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('model.completed'))
    expect(info).toHaveBeenCalledWith(expect.stringContaining('audit-id'))
  })

  it('uses the default model for Verifier and never immediately retries a 429', async () => {
    configure()
    const valid = new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decisions: [{ candidateId: 'c', admitted: true, contradictions: [] }] }) } }] }), { status: 200 })
    const fetchMock = vi.fn().mockResolvedValueOnce(valid).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2.5' } }))
    vi.stubGlobal('fetch', fetchMock)
    await runVerifier(new OpenAiCompatibleAuditModel(), [candidate], evidence)
    const verifierBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(verifierBody.model).toBe('verifier-model')
    expect(verifierBody.messages[0].content).toContain(JSON.stringify(verifierBody.response_format.json_schema.schema))
    expect(verifierBody.messages[0].content).toContain('using each supplied candidate ID exactly once')
    expect(verifierBody.messages[0].content).toContain('impact is medium')
    expect(verifierBody.messages[0].content).toContain('confidence of at least 0.8')
    expect(verifierBody.messages[0].content).toContain('{"decisions":[]}')
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toEqual(expect.objectContaining({ code: 'rate_limit', retryAfterMs: 2_500 }) satisfies Partial<AuditModelRateLimitError>)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('parses HTTP-date rate limits and bounds missing or excessive retry delays', async () => {
    configure()
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'))
    for (const [header, expected] of [
      ['Wed, 26 Aug 2026 00:00:03 GMT', 3_000],
      [undefined, 60_000],
      ['9999', 300_000],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, ...(header ? { headers: { 'Retry-After': header } } : {}) })))
      await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ retryAfterMs: expected })
    }
    vi.useRealTimers()
  })

  it('asks Vercel AI Gateway to sort providers by throughput', async () => {
    configure('1')
    process.env.AI_API_BASE_URL = 'https://ai-gateway.vercel.sh/v1'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [candidate] }) } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await runCritic(new OpenAiCompatibleAuditModel(), evidence)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.providerOptions).toEqual({ gateway: { sort: 'tps' } })
  })

  it.each([
    ['provider', () => Promise.resolve(new Response('', { status: 503 }))],
    ['invalid_output', () => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{bad' } }] }), { status: 200, headers: { 'cf-ray': 'cloudflare-request' } }))],
    ['timeout', () => Promise.reject(new DOMException('late', 'TimeoutError'))],
  ] as const)('bounds retries for %s failures', async (code, response) => {
    configure()
    const fetchMock = vi.fn().mockImplementation(response)
    vi.stubGlobal('fetch', fetchMock)
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ code } satisfies Partial<AuditModelError>)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.reduce((total, call) => total + JSON.parse(call[1].body).max_completion_tokens, 0)).toBe(8000)
  })

  it('classifies missing content, invalid schema, network failure, and configuration failure', async () => {
    configure('1')
    for (const [value, headers, context] of [
      [{ choices: [] }, { 'x-vercel-id': 'vercel-request' }, { reason: 'missing_content', requestId: 'vercel-request' }],
      [{ choices: [{ message: {} }] }, {}, { reason: 'missing_content' }],
      [{ choices: [{ message: { content: '{bad' } }] }, {}, { reason: 'invalid_json' }],
      [{ choices: [{ message: { content: JSON.stringify({ candidates: [{ nope: true }] }) } }] }, { 'x-request-id': 'provider-request' }, { reason: 'schema_validation', requestId: 'provider-request' }],
      [{ choices: [{ message: { content: JSON.stringify({ candidates: [], unexpected: true }) } }] }, {}, { reason: 'schema_validation', validationIssues: ['$:unrecognized_keys'] }],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200, headers })))
      await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ code: 'invalid_output', context })
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ code: 'provider' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'))
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ code: 'provider', context: { reason: 'network_error' } })
    delete process.env.AI_API_KEY
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({ code: 'configuration' })
  })

  it('reads top-level provider errors and ignores non-text provider detail', async () => {
    configure('1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 'busy', message: 'Try later' }), { status: 503 })))
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence)).rejects.toMatchObject({
      code: 'provider', context: { providerCode: 'busy', providerMessage: 'Try later' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 503, message: { detail: 'busy' } }), { status: 503 })))
    const failure = await runCritic(new OpenAiCompatibleAuditModel(), evidence).catch((error) => error)
    expect(failure.context).not.toHaveProperty('providerCode')
    expect(failure.context).not.toHaveProperty('providerMessage')
  })

  it('rejects oversized or expired model inputs before contacting the provider', async () => {
    configure('1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new OpenAiCompatibleAuditModel().generate('critic', { value: 'x'.repeat(33_000) }, z.object({}).strict())).rejects.toMatchObject({ code: 'budget' })
    await expect(runCritic(new OpenAiCompatibleAuditModel(), evidence, 100, Date.now() - 1)).rejects.toMatchObject({ code: 'timeout' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
