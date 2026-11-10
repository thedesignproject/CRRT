// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { recordSql, recordTranscriptionSql } from './schema'

const enabled = process.env.RECORD_TEST_LOCAL === '1'
const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (enabled && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Record tests require loopback Docker')
const db = postgres(url, { max: 4 })
const actor = randomUUID(), other = randomUUID(), id = randomUUID(), clientKey = randomUUID()
const input = { clientKey, requestHash: 'create-hash', shareHash: randomUUID(), title: 'Review', source: 'tab' }
const additional: string[] = []
const artifact = { id: randomUUID(), path: `${actor}/${id}/screen`, kind: 'screen', mime: 'video/webm', bytes: 20, sha256: 'a'.repeat(64), offsetMs: 0 }
async function command(action: string, value = {}, user = actor) {
  const [row] = await db`select public.record_command(${user},${id},${action},${db.json(value)}) as result`
  return row.result
}
async function fixture(finalize = true) {
  const recording = randomUUID(); additional.push(recording)
  await db`select public.record_create(${actor},${recording},${db.json({ ...input, clientKey: randomUUID(), shareHash: randomUUID() })},100)`
  const declaration = { id: randomUUID(), kind: 'screen', mime: 'video/webm', bytes: 1, sha256: 'b'.repeat(64), offsetMs: 0 }
  await db`insert into public.recording_artifacts(id,recording_id,kind,path,mime,bytes,sha256,verified_at)
    values(${declaration.id},${recording},'screen',${actor + '/' + recording + '/' + declaration.id + '.webm'},'video/webm',1,${declaration.sha256},now())`
  await db`update public.recordings set reserved_bytes=1 where id=${recording}`
  const manifest = { events: [], durationMs: 1000, artifacts: [declaration] }
  if (finalize) await db`select public.record_command(${actor},${recording},'finalize',${db.json({ manifestHash: 'hash', manifest })})`
  return { recording, manifest, declaration }
}

it('keeps all transaction DDL in the single generated migration', () => {
  const migration = readFileSync(new URL('./migrations/0050_record_v1.sql', import.meta.url), 'utf8')
  expect(migration).toContain(recordSql)
  expect(migration).toContain(recordTranscriptionSql)
  for (const table of ['recordings', 'recording_artifacts', 'recording_events', 'recording_keyframes', 'recording_transcript_segments', 'recording_jobs', 'recording_usage']) {
    expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
  }
})

describe.skipIf(!enabled)('Record database transactions on Docker', () => {
  beforeAll(async () => {
    await db`insert into auth.users(id,email) values(${actor},${actor + '@record.test'}),(${other},${other + '@record.test'})`
  })
  afterAll(async () => {
    await db`delete from public.recordings where owner_id in (${actor},${other}) or id=${id}`
    if (additional.length) await db`delete from public.recordings where id=any(${additional}::uuid[])`
    await db`delete from public.billing_accounts where user_id in (${actor},${other})`
    await db`delete from auth.users where id in (${actor},${other})`
    await db.end()
  })
  it('applies the complete new migration from scratch transactionally', async () => {
    await expect(db.begin(async tx => {
      await tx.unsafe(`DROP TRIGGER record_owner_deleted ON public.recordings; DROP FUNCTION public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint),public.record_refresh_state(uuid),public.record_owner_deleted(),public.record_create(uuid,uuid,jsonb,integer),public.record_command(uuid,uuid,text,jsonb),public.record_claim(text,uuid),public.record_finish(uuid,text,uuid,jsonb,jsonb),public.record_sweep(),public.record_charge_payload(uuid,uuid,uuid,integer,integer,text,text[]),public.record_usage_summary(uuid);
        DROP TABLE public.recording_transcription_limits,public.recording_keyframes,public.recording_transcript_segments,public.recording_events,public.recording_artifacts,public.recording_jobs,public.recording_usage,public.recordings;`)
      await tx.unsafe(readFileSync(new URL('./migrations/0050_record_v1.sql', import.meta.url), 'utf8'))
      const tables = await tx`select relrowsecurity from pg_class where relname in ('recordings','recording_artifacts','recording_events','recording_keyframes','recording_transcript_segments','recording_jobs','recording_usage')`
      expect(tables).toHaveLength(7)
      expect(tables.every(t => t.relrowsecurity)).toBe(true)
      throw new Error('rollback_record_migration_test')
    })).rejects.toThrow('rollback_record_migration_test')
  })
  it('atomically reserves persistent client/global transcription requests and bytes', async () => {
    const reserve = (key: string, clientLimit = 2, globalLimit = 20, globalBytes = 1000) => db`select public.reserve_record_transcription(${key},10,${clientLimit},100,${globalLimit},${globalBytes}) as allowed`
    await db`delete from public.recording_transcription_limits`
    try {
      const sameClient = await Promise.all(Array.from({ length: 12 }, () => reserve('a'.repeat(64))))
      expect(sameClient.filter(r => r[0].allowed)).toHaveLength(2)
      expect((await db`select requests,bytes from public.recording_transcription_limits where identity='global'`)[0]).toMatchObject({ requests: 2, bytes: '20' })
      await db`delete from public.recording_transcription_limits`
      const clients = await Promise.all(Array.from({ length: 12 }, (_, i) => reserve(i.toString(16).padStart(64, '0'), 20, 3)))
      expect(clients.filter(r => r[0].allowed)).toHaveLength(3)
      expect(await reserve('f'.repeat(64), 20, 100, 30)).toMatchObject([{ allowed: false }])
      // A denied global reservation creates no client row or extra spend.
      expect(await db`select * from public.recording_transcription_limits where identity=${'f'.repeat(64)}`).toHaveLength(0)
      await db`update public.recording_transcription_limits set window_start=now()-interval '2 days'`
      expect(await reserve('a'.repeat(64), 1, 1, 10)).toMatchObject([{ allowed: true }])
      expect(await reserve('b'.repeat(64), 20, 100, 19)).toMatchObject([{ allowed: false }])
      expect(await db`select * from public.recording_transcription_limits where identity not in ('global',${'a'.repeat(64)})`).toHaveLength(0)
      const [grants] = await db`select has_function_privilege('anon','public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint)','execute') as anon, has_function_privilege('authenticated','public.reserve_record_transcription(text,bigint,integer,bigint,integer,bigint)','execute') as authenticated`
      expect(grants).toEqual({ anon: false, authenticated: false })
      await expect(db`select public.reserve_record_transcription('bad',10,1,1,1,1)`).rejects.toThrow('record_transcription_invalid')
    } finally { await db`delete from public.recording_transcription_limits` }
  })
  it('admits worker-sized audio while enforcing configurable budgets and the 32 MiB safety ceiling', async () => {
    await db`delete from public.recording_transcription_limits`
    const client = 'e'.repeat(64)
    try {
      expect(await db`select public.reserve_record_transcription(${client},5242880,10,67108864,100,134217728) as allowed`).toEqual([{ allowed: true }])
      expect(await db`select public.reserve_record_transcription(${client},33554432,10,67108864,100,134217728) as allowed`).toEqual([{ allowed: true }])
      await expect(db`select public.reserve_record_transcription(${client},33554433,10,67108864,100,134217728)`).rejects.toThrow('record_transcription_invalid')
      expect(await db`select public.reserve_record_transcription(${'f'.repeat(64)},5242880,10,4194304,100,134217728) as allowed`).toEqual([{ allowed: false }])
      expect((await db`select requests,bytes from public.recording_transcription_limits where identity='global'`)[0]).toMatchObject({ requests: 2, bytes: String(5242880 + 33554432) })
    } finally { await db`delete from public.recording_transcription_limits` }
  })
  it('creates personal records idempotently and serializes concurrent quota checks', async () => {
    const results = await Promise.all([1, 2].map(() => db`select public.record_create(${actor},${id},${db.json(input)},1) as r`))
    expect(results[0][0].r.id).toBe(id)
    expect(results[1][0].r.project_key).toBeNull()
    await expect(db`select public.record_create(${actor},${randomUUID()},${db.json({ ...input, clientKey: randomUUID() })},1)`).rejects.toThrow('record_quota')
    await expect(db`select public.record_create(${actor},${id},${db.json({ ...input, requestHash: 'different' })},1)`).rejects.toThrow('record_conflict')
  })
  it('rejects cross-owner operations and unauthorized attachment', async () => {
    await expect(command('title', { title: 'stolen' }, other)).rejects.toThrow('record_not_found')
    await expect(command('project', { projectKey: 'not-a-member' })).rejects.toThrow('record_forbidden')
    expect((await command('title', { title: 'Renamed' })).title).toBe('Renamed')
    expect((await command('project', { projectKey: null })).project_key).toBeNull()
  })
  it('denies all direct anonymous/authenticated rows and privileged RPCs', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.begin(async tx => {
        await tx.unsafe(`grant select on public.recordings to ${role}`)
        await tx.unsafe(`set local role ${role}`)
        const rows = await tx`select id from public.recordings`
        expect(rows).toHaveLength(0)
        await tx`reset role`
        await tx.unsafe(`revoke select on public.recordings from ${role}`)
      })
      await expect(db.begin(async tx => {
        await tx.unsafe(`set local role ${role}`)
        await tx`select public.record_sweep()`
      })).rejects.toThrow('permission denied')
    }
  })
  it('reserves storage once and finalizes atomically exactly once', async () => {
    await expect(command('finalize', { manifestHash: 'one' })).rejects.toThrow('record_upload_incomplete')
    await expect(command('upload', { artifact, byteLimit: 10 })).rejects.toThrow('record_quota')
    for (let i = 0; i < 2; i++) await command('upload', { artifact, byteLimit: 1073741824 })
    await expect(command('upload', { artifact: { ...artifact, bytes: 21 }, byteLimit: 100 })).rejects.toThrow('record_conflict')
    await command('complete', { artifactId: artifact.id })
    await command('complete', { artifactId: artifact.id })
    const { path: _path, ...declaration } = artifact
    const manifest = { durationMs: 1000, artifacts: [declaration], events: [{ id: randomUUID(), sequence: 0, kind: 'click', atMs: 500 }] }
    const result = await command('finalize', { manifest, manifestHash: 'one' })
    expect(result.state).toBe('processing')
    expect(result.reserved_bytes).toBe(20 + 2 * 2097152)
    expect((await command('finalize', { manifest, manifestHash: 'one' })).revision).toBe(result.revision)
    await expect(command('finalize', { manifestHash: 'two' })).rejects.toThrow('record_conflict')
    await expect(command('upload', { artifact, byteLimit: 100 })).rejects.toThrow('record_conflict')
    expect((await db`select * from public.recording_jobs where recording_id=${id}`)).toHaveLength(3)
  })
  it('fences stale workers and blocks alignment until prerequisites finish', async () => {
    expect((await db`select public.record_claim('alignment',${randomUUID()}) as j`)[0].j).toBeNull()
    for (const stage of ['metadata', 'transcription', 'alignment']) {
      const lease = randomUUID()
      const [claimed] = await db`select public.record_claim(${stage},${lease}) as j`
      expect(claimed.j.recording_id).toBe(id)
      expect((await db`select public.record_finish(${id},${stage},${randomUUID()},'{}') as ok`)[0].ok).toBe(false)
      const output = stage === 'metadata' ? { artifacts: [], keyframes: [] } : { segments: [], source: 'fake', language: 'en' }
      expect((await db`select public.record_finish(${id},${stage},${lease},${db.json(output)}) as ok`)[0].ok).toBe(true)
    }
    expect((await db`select state from public.recordings where id=${id}`)[0].state).toBe('ready')
  })
  it('charges agent usage independently and schedules deletion without losing source rows', async () => {
    const key = randomUUID()
    await expect(db`select public.record_charge_payload(${actor},${id},${key},1,(SELECT revision FROM public.recordings WHERE id=${id}),NULL,ARRAY['price_test'])`).rejects.toThrow('record_upgrade_required')
    await db`insert into public.billing_accounts(user_id,plan,price_id,subscription_status,period_start,period_end)
      values(${actor},'pro','price_test','active',now()-interval '1 day',now()+interval '29 days')`
    await db`select public.record_charge_payload(${actor},${id},${key},1,(SELECT revision FROM public.recordings WHERE id=${id}),NULL,ARRAY['price_test'])`
    await db`update public.billing_accounts set subscription_status='canceled' where user_id=${actor}`
    await expect(db`select public.record_charge_payload(${actor},${id},${key},1,(SELECT revision FROM public.recordings WHERE id=${id}),NULL,ARRAY['price_test'])`).rejects.toThrow('record_upgrade_required')
    for (let i = 0; i < 2; i++) await db`select public.record_charge_payload(${actor},${id},${key},1,(SELECT revision FROM public.recordings WHERE id=${id}),NULL)`
    await expect(db`select public.record_charge_payload(${actor},${id},${randomUUID()},1,(SELECT revision FROM public.recordings WHERE id=${id}),NULL)`).rejects.toThrow('record_quota')
    await expect(command('retry', { stage: 'metadata' })).rejects.toThrow('record_conflict')
    const [snapshot] = await db`select revision from public.recordings where id=${id}`
    await command('title', { title: 'Changed after payload read' })
    await expect(db`select public.record_charge_payload(${actor},${id},${key},1,${snapshot.revision},NULL)`).rejects.toThrow('record_conflict')
    await expect(db`select public.record_charge_payload(${actor},${id},${key},1,(SELECT revision FROM public.recordings WHERE id=${id}),'changed-project')`).rejects.toThrow('record_conflict')
    await command('delete')
    expect((await db`select * from public.recording_artifacts where recording_id=${id}`)).toHaveLength(1)
    expect((await db`select state from public.recording_jobs where recording_id=${id} and stage='cleanup'`)[0].state).toBe('pending')
    await expect(command('title', { title: 'deleted' })).rejects.toThrow('record_not_found')
  })
  it('recovers expired leases, distinguishes terminal failures and keeps cleanup retrying', async () => {
    const recording = randomUUID(); additional.push(recording)
    await db`select public.record_create(${actor},${recording},${db.json({ ...input, clientKey: randomUUID(), shareHash: randomUUID() })},100)`
    const source = randomUUID()
    await db`insert into public.recording_artifacts(id,recording_id,kind,path,mime,bytes,sha256,verified_at)
      values(${source},${recording},'screen',${actor + '/' + recording + '/source.webm'},'video/webm',1,'hash',now())`
    await db`select public.record_command(${actor},${recording},'finalize',${db.json({ manifestHash: 'hash', manifest: { events: [], durationMs: 1000, artifacts: [{ id: source, kind: 'screen', mime: 'video/webm', bytes: 1, sha256: 'hash', offsetMs: 0 }] } })})`
    const first = randomUUID()
    await db`select public.record_claim('metadata',${first})`
    await db`update public.recording_jobs set lease_until=now()-interval '1 second' where recording_id=${recording} and stage='metadata'`
    const reclaimed = await Promise.all([randomUUID(), randomUUID()].map(lease => db`select public.record_claim('metadata',${lease}) as j`))
    const winners = reclaimed.map(r => r[0].j).filter(Boolean)
    expect(winners).toHaveLength(1)
    expect((await db`select public.record_finish(${recording},'metadata',${first},'{}') as ok`)[0].ok).toBe(false)
    await db`select public.record_finish(${recording},'metadata',${winners[0].lease_token},'{}',${db.json({ code: 'invalid_media', retryable: false, stage: 'metadata' })})`
    await expect(db`select public.record_command(${actor},${recording},'retry','{"stage":"metadata"}')`).rejects.toThrow('record_conflict')
    expect((await db`select * from public.recording_artifacts where recording_id=${recording}`)).toHaveLength(1)
    await db`select public.record_command(${actor},${recording},'delete','{}')`
    expect((await db`select public.record_claim('cleanup',${randomUUID()}) as j`)[0].j).toBeNull()
    await db`update public.recording_jobs set available_at=now(),attempts=26 where recording_id=${recording} and stage='cleanup'`
    let lease = randomUUID()
    await db`select public.record_claim('cleanup',${lease})`
    await db`select public.record_finish(${recording},'cleanup',${lease},'{}','{"code":"temporary_storage_failure","retryable":false}')`
    expect((await db`select state from public.recording_jobs where recording_id=${recording} and stage='cleanup'`)[0].state).toBe('pending')
    expect((await db`select available_at<=now()+interval '3600 seconds' bounded from public.recording_jobs where recording_id=${recording} and stage='cleanup'`)[0].bounded).toBe(true)
    await db`update public.recording_jobs set available_at=now() where recording_id=${recording} and stage='cleanup'`
    lease = randomUUID(); await db`select public.record_claim('cleanup',${lease})`
    await db`select public.record_finish(${recording},'cleanup',${lease},'{}')`
    expect((await db`select cleaned_at,manifest from public.recordings where id=${recording}`)[0]).toMatchObject({ manifest: null })
    expect((await db`select * from public.recording_artifacts where recording_id=${recording}`)).toHaveLength(0)
    expect((await db`select storage_prefix from public.recordings where id=${recording}`)[0].storage_prefix).toBe(`${actor}/${recording}`)
    await db`update public.recording_jobs set available_at=now() where recording_id=${recording} and stage='cleanup'`
    await db`select public.record_sweep()`
    expect((await db`select state from public.recording_jobs where recording_id=${recording} and stage='cleanup'`)[0].state).toBe('pending')
  })
  it('sweeps abandoned sessions and retains cleanup ownership paths after account deletion', async () => {
    const abandoned = randomUUID(), orphan = randomUUID(); additional.push(abandoned, orphan)
    for (const [user, recording] of [[actor, abandoned], [other, orphan]]) {
      await db`select public.record_create(${user},${recording},${db.json({ ...input, clientKey: randomUUID(), shareHash: randomUUID() })},100)`
    }
    await db`update public.recordings set abandoned_at=now()-interval '1 day' where id=${abandoned}`
    await db`delete from auth.users where id=${other}`
    expect((await db`select deleted_at from public.recordings where id=${orphan}`)[0].deleted_at).toBeTruthy()
    expect((await db`select stage from public.recording_jobs where recording_id=${orphan}`)[0].stage).toBe('cleanup')
    await db`select public.record_sweep()`
    const rows = await db`select owner_id,deleted_at from public.recordings where id in (${abandoned},${orphan})`
    expect(rows.every(r => r.deleted_at)).toBe(true)
    expect(rows.some(r => r.owner_id === null)).toBe(true)
    expect((await db`select * from public.recording_jobs where recording_id in (${abandoned},${orphan}) and stage='cleanup'`)).toHaveLength(2)
    expect((await db`select public.record_usage_summary(${actor}) as usage`)[0].usage).toHaveProperty('storageBytes')
  })
  it('retains sibling failures until every prerequisite has recovered', async () => {
    const { recording } = await fixture()
    await db`update public.recording_jobs set state='failed',failure=jsonb_build_object('code',stage||'_failed','stage',stage,'retryable',true)
      where recording_id=${recording} and stage in ('metadata','transcription')`
    await db`select public.record_refresh_state(${recording})`
    await db`select public.record_command(${actor},${recording},'retry','{"stage":"transcription"}')`
    expect((await db`select state,failure from public.recordings where id=${recording}`)[0]).toMatchObject({ state: 'failed', failure: { stage: 'metadata' } })
    let lease = randomUUID(); await db`select public.record_claim('transcription',${lease})`
    await db`select public.record_finish(${recording},'transcription',${lease},'{"segments":[],"source":"fixture","language":"en"}')`
    expect((await db`select state from public.recordings where id=${recording}`)[0].state).toBe('failed')
    await db`select public.record_command(${actor},${recording},'retry','{"stage":"metadata"}')`
    expect((await db`select state from public.recordings where id=${recording}`)[0].state).toBe('processing')
    lease = randomUUID(); await db`select public.record_claim('metadata',${lease})`
    await db`select public.record_finish(${recording},'metadata',${lease},'{"artifacts":[],"keyframes":[],"byteLimit":5368709120}')`
    lease = randomUUID(); await db`select public.record_claim('alignment',${lease})`
    await db`select public.record_finish(${recording},'alignment',${lease},'{}')`
    expect((await db`select state from public.recordings where id=${recording}`)[0].state).toBe('ready')
  })
  it('rejects declaration changes that committed after an API manifest preflight', async () => {
    const { recording, manifest } = await fixture(false)
    const camera = { id: randomUUID(), kind: 'camera', mime: 'video/webm', bytes: 1, sha256: 'c'.repeat(64), offsetMs: 0 }
    await db`select public.record_command(${actor},${recording},'upload',${db.json({ artifact: { ...camera, path: `${actor}/${recording}/${camera.id}.webm` }, byteLimit: 5368709120 })})`
    await db`select public.record_command(${actor},${recording},'complete',${db.json({ artifactId: camera.id })})`
    await expect(db`select public.record_command(${actor},${recording},'finalize',${db.json({ manifestHash: 'one', manifest })})`).rejects.toThrow('record_artifact_mismatch')
    expect((await db`select * from public.recording_jobs where recording_id=${recording}`)).toHaveLength(0)
    await db`select public.record_command(${actor},${recording},'finalize',${db.json({ manifestHash: 'two', manifest: { ...manifest, artifacts: [...manifest.artifacts, camera] } })})`
  })
})

