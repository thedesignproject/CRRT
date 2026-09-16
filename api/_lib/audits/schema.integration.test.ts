import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

const enabled = process.env.AUDIT_DB_INTEGRATION === 'true'
const connection = process.env.DATABASE_URL
const sql = enabled && connection ? postgres(connection, { max: 8 }) : null
const integration = enabled && sql ? describe : describe.skip
const hashes = new Set<string>()

function identity() {
  const suffix = randomUUID().replace(/-/g, '')
  const session = `test-session-${suffix}`
  const ip = `test-ip-${suffix}`
  hashes.add(session)
  hashes.add(ip)
  return { session, ip }
}

async function createRun(session: string, ip: string, key: string) {
  const expires = new Date(Date.now() + 86_400_000)
  const [row] = await sql!`
    select public.create_audit_run(
      p_owner_kind => 'anonymous', p_project_key => null,
      p_creator_user_id => null, p_start_idempotency_key => ${key},
      p_capability_token_hash => ${`cap-${key}`},
      p_anonymous_session_hash => ${session}, p_anonymous_ip_hash => ${ip},
      p_input_url => 'https://example.com', p_normalized_url => 'https://example.com/',
      p_mode => 'live', p_budgets => ${sql!.json({ wallClockMs: 300000 })},
      p_coverage => ${sql!.json({ evaluatedSources: [], unavailableSources: [] })},
      p_source_snapshot => ${sql!.json({ url: 'https://example.com/' })},
      p_expires_at => ${expires}
    ) as result
  `
  return row.result as { status: string; auditId?: string; runStatus?: string; expiresAt?: string }
}

async function completeStage(auditId: string, stage: 'explorer' | 'critic', leaseSeconds = 60) {
  const [lease] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, ${stage}, ${leaseSeconds}) as result`
  expect(lease.result.status).toBe('acquired')
  const payload = stage === 'explorer'
    ? { evidence: [], coverage: { evaluatedSources: ['url'], unavailableSources: [], routesAttempted: 1, routesEvaluated: 1 } }
    : { candidates: [] }
  const [completed] = await sql!`select public.complete_audit_stage(${auditId}::uuid, ${stage}, ${lease.result.leaseToken}, ${sql!.json(payload)}) as result`
  expect(completed.result.status).toBe('completed')
}

afterAll(async () => {
  if (!sql) return
  const values = [...hashes]
  if (values.length) {
    await sql`delete from public.audit_runs where anonymous_session_hash in ${sql(values)}`
    await sql`delete from public.audit_rate_limit_windows where identity_hash in ${sql(values)}`
  }
  await sql.end()
})

integration('audit schema against local Postgres', () => {
  it('denies direct anonymous reads and enforces concurrent quota plus truthful replay', async () => {
    await expect(sql!.begin(async (transaction) => {
      await transaction`set local role anon`
      await transaction`select id from public.audit_runs limit 1`
    })).rejects.toThrow()

    const { session, ip } = identity()
    const results = await Promise.all([
      createRun(session, ip, 'concurrent-a'),
      createRun(session, ip, 'concurrent-b'),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['created', 'rate_limited'])
    const created = results.find((result) => result.status === 'created')!
    const replay = await createRun(session, ip, created === results[0] ? 'concurrent-a' : 'concurrent-b')
    expect(replay).toMatchObject({ status: 'existing', auditId: created.auditId, runStatus: 'queued' })
    expect(replay.expiresAt).toBeTruthy()
  })

  it('checkpoints leases, atomically fails once, and cascades durable rows', async () => {
    const { session, ip } = identity()
    const created = await createRun(session, ip, 'lifecycle')
    const auditId = created.auditId!
    const [blocked] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'critic', 60) as result`
    expect(blocked.result.status).toBe('not_ready')
    const [lease] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 60) as result`
    expect(lease.result.status).toBe('acquired')
    await sql!`select public.complete_audit_stage(${auditId}::uuid, 'explorer', ${lease.result.leaseToken}, ${sql!.json({ evidenceCount: 1 })})`
    const [checkpoint] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 60) as result`
    expect(checkpoint.result.status).toBe('already_completed')

    await sql!`insert into public.audit_evidence
      (audit_id, evidence_key, source, signal_key, kind, route, observation, confidence, direct)
      values (${auditId}::uuid, 'evidence-1', 'url', 'signal-1', 'observable', '/', 'Observed', 1, true)`
    await Promise.all([
      sql!`select public.mark_audit_run_failed(${auditId}::uuid, 'test_failure', 'Safe failure')`,
      sql!`select public.mark_audit_run_failed(${auditId}::uuid, 'test_failure', 'Safe failure')`,
    ])
    const [failure] = await sql!`select status, count(*) filter (where event_type = 'audit.failed')::int as failures
      from public.audit_runs join public.audit_events on audit_events.audit_id = audit_runs.id
      where audit_runs.id = ${auditId}::uuid group by audit_runs.status`
    expect(failure).toMatchObject({ status: 'failed', failures: 1 })
    await sql!`delete from public.audit_runs where id = ${auditId}::uuid`
    const [remaining] = await sql!`select count(*)::int as count from public.audit_evidence where audit_id = ${auditId}::uuid`
    expect(remaining.count).toBe(0)
  })

  it('releases rate-limited leases and only permits guarded partial completion', async () => {
    const { session, ip } = identity()
    const created = await createRun(session, ip, 'model-rate-limit')
    const auditId = created.auditId!
    const [explorer] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 60) as result`
    await sql!`select public.complete_audit_stage(${auditId}::uuid, 'explorer', ${explorer.result.leaseToken}, ${sql!.json({ evidence: [], coverage: { evaluatedSources: ['url'], unavailableSources: [] } })})`
    const [critic] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'critic', 60) as result`
    const requested = new Date(Date.now() + 1_000)
    const [deferred] = await sql!`select public.defer_audit_stage_retry(${auditId}::uuid, 'critic', ${critic.result.leaseToken}, ${requested}) as result`
    expect(deferred.result).toMatchObject({ status: 'deferred' })
    expect(new Date(deferred.result.retryAt).getTime()).toBeGreaterThanOrEqual(Date.now() + 59_000)
    const [released] = await sql!`select stage_lease_token, stage_lease_expires_at, retry_not_before from public.audit_runs where id = ${auditId}::uuid`
    expect(released).toMatchObject({ stage_lease_token: null, stage_lease_expires_at: null })
    expect(released.retry_not_before.getTime()).toBe(new Date(deferred.result.retryAt).getTime())
    const [premature] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'critic', 60) as result`
    expect(premature.result).toMatchObject({ status: 'deferred', retryAt: deferred.result.retryAt })
    const [finished] = await sql!`select public.finish_audit_model_rate_limited(${auditId}::uuid) as result`
    expect(finished.result).toMatchObject({ status: 'partial', findingCount: 0 })
    const [run] = await sql!`select status, current_stage, error_code, coverage->>'partialReason' as reason from public.audit_runs where id = ${auditId}::uuid`
    expect(run).toMatchObject({ status: 'partial', current_stage: 'completed', error_code: 'model_rate_limited', reason: expect.any(String) })

    const { session: otherSession, ip: otherIp } = identity()
    const other = await createRun(otherSession, otherIp, 'unguarded-rate-limit')
    const otherAuditId = other.auditId!
    const [unguarded] = await sql!`select public.finish_audit_model_rate_limited(${otherAuditId}::uuid) as result`
    expect(unguarded.result.status).toBe('invalid_state')
  })

  it('keeps Verifier finalization fenced and rejects generic stage completion', async () => {
    const { session, ip } = identity()
    const created = await createRun(session, ip, 'verifier-fence')
    const auditId = created.auditId!
    await completeStage(auditId, 'explorer')
    await completeStage(auditId, 'critic')
    const [verifier] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'verifier', 60) as result`
    expect(verifier.result.status).toBe('acquired')

    const [generic] = await sql!`select public.complete_audit_stage(${auditId}::uuid, 'verifier', ${verifier.result.leaseToken}, ${sql!.json({})}) as result`
    expect(generic.result.status).toBe('invalid_input')
    const [renewed] = await sql!`select public.renew_audit_stage_lease(${auditId}::uuid, 'verifier', ${verifier.result.leaseToken}, 60) as result`
    expect(renewed.result.status).toBe('renewed')
    const [finalized] = await sql!`select public.finalize_audit_verification(
      ${auditId}::uuid, ${verifier.result.leaseToken}, ${sql!.json([])},
      ${sql!.json({ evaluatedSources: ['url'], unavailableSources: [], routesAttempted: 1, routesEvaluated: 1 })}
    ) as result`
    expect(finalized.result).toMatchObject({ status: 'completed', findingCount: 0 })
  })

  it('renews short leases and permits recovery only after the renewed lease expires', async () => {
    const { session, ip } = identity()
    const created = await createRun(session, ip, 'lease-renewal')
    const auditId = created.auditId!
    const [lease] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 1) as result`
    expect(lease.result.status).toBe('acquired')
    const [renewed] = await sql!`select public.renew_audit_stage_lease(${auditId}::uuid, 'explorer', ${lease.result.leaseToken}, 2) as result`
    expect(renewed.result.status).toBe('renewed')

    await sql!`select pg_sleep(1.1)`
    const [stillBusy] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 60) as result`
    expect(stillBusy.result.status).toBe('busy')
    await sql!`select pg_sleep(1.1)`
    const [recovered] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, 'explorer', 60) as result`
    expect(recovered.result.status).toBe('acquired')
    expect(recovered.result.leaseToken).not.toBe(lease.result.leaseToken)
  })

  it.each(['critic', 'verifier'] as const)('atomically finishes a fenced %s budget exhaustion as partial', async (stage) => {
    const { session, ip } = identity()
    const created = await createRun(session, ip, `partial-${stage}`)
    const auditId = created.auditId!
    await completeStage(auditId, 'explorer')
    if (stage === 'verifier') await completeStage(auditId, 'critic')
    const [lease] = await sql!`select public.acquire_audit_stage_lease(${auditId}::uuid, ${stage}, 60) as result`
    expect(lease.result.status).toBe('acquired')

    const [wrongLease] = await sql!`select public.finish_audit_partial(
      ${auditId}::uuid, ${stage}, ${randomUUID()}::uuid,
      ${sql!.json({ evaluatedSources: ['url'], unavailableSources: [], partialReason: 'Budget reached' })},
      'model_timeout', 'Budget reached'
    ) as result`
    expect(wrongLease.result.status).toBe('lease_mismatch')
    const [finished] = await sql!`select public.finish_audit_partial(
      ${auditId}::uuid, ${stage}, ${lease.result.leaseToken},
      ${sql!.json({ evaluatedSources: ['url'], unavailableSources: [], partialReason: 'Budget reached' })},
      'model_timeout', 'Budget reached'
    ) as result`
    expect(finished.result).toMatchObject({ status: 'partial', findingCount: 0 })
    const [run] = await sql!`select status, current_stage, error_code, stage_lease_token, retry_not_before from public.audit_runs where id = ${auditId}::uuid`
    expect(run).toMatchObject({ status: 'partial', current_stage: 'completed', error_code: 'model_timeout', stage_lease_token: null, retry_not_before: null })
    const [events] = await sql!`select count(*)::int as count from public.audit_events where audit_id = ${auditId}::uuid and event_type = 'audit.coverage.partial'`
    expect(events.count).toBe(1)
  })
})
