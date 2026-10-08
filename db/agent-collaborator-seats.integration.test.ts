import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.AGENT_SEATS_DB_TEST === 'true'
const connection = process.env.DATABASE_URL || ''
if (enabled && !/^postgres(?:ql)?:\/\/[^/]+@(localhost|127\.0\.0\.1):/.test(connection)) throw new Error('Local database required')
const suite = enabled ? describe : describe.skip
const sql = enabled ? postgres(connection, { max: 8 }) : null

const owner = randomUUID()
const secondOwner = randomUUID()
const collaborators = Array.from({ length: 8 }, () => randomUUID())
const secondCollaborators = Array.from({ length: 6 }, () => randomUUID())
const projectA = `agent-seat-a-${randomUUID()}`
const projectB = `agent-seat-b-${randomUUID()}`
const projectC = `agent-seat-c-${randomUUID()}`
const email = (id: string) => `${id}@seat.test`

beforeAll(async () => {
  if (!sql) return
  const users = [owner, secondOwner, ...collaborators, ...secondCollaborators]
  await sql`insert into auth.users(id,email,email_confirmed_at)
    select id::uuid, id || '@seat.test', now() from unnest(${users}::text[]) ids(id)`
  await sql`insert into public.projects(public_key,slug,name) values
    (${projectA},${projectA},'Agent seats A'), (${projectB},${projectB},'Agent seats B'),
    (${projectC},${projectC},'Agent seats C')`
  await sql`insert into public.project_members(project_key,user_id,role,is_owner) values
    (${projectA},${owner},'admin',true), (${projectB},${owner},'admin',true),
    (${projectC},${secondOwner},'admin',true)`
  for (const user of collaborators.slice(0, 5)) {
    await sql`insert into public.project_members(project_key,user_id,role) values (${projectA},${user},'member')`
  }
  for (const user of secondCollaborators.slice(0, 4)) {
    await sql`insert into public.project_members(project_key,user_id,role) values (${projectC},${user},'member')`
  }
})

afterAll(async () => {
  if (!sql) return
  await sql`delete from public.projects where public_key in (${projectA},${projectB},${projectC})`
  const users = [owner, secondOwner, ...collaborators, ...secondCollaborators]
  await sql`delete from auth.users where id = any(${users}::uuid[])`
  await sql.end()
})

suite('owner-sponsored Agent collaborator seats', () => {
  it('deduplicates identities across projects and reserves pending invitations', async () => {
    expect((await sql!`select public.agent_collaborator_usage(${owner}) as usage`)[0].usage).toBe(5)

    await sql!`insert into public.project_members(project_key,user_id,role) values (${projectB},${collaborators[0]},'admin')`
    await sql!`insert into public.project_invites(project_key,email,role,invited_by)
      values (${projectB},${email(collaborators[0])},'member',${owner})`
    expect((await sql!`select public.agent_collaborator_usage(${owner}) as usage`)[0].usage).toBe(5)

    await expect(sql!`insert into public.project_invites(project_key,email,role,invited_by)
      values (${projectA},${email(collaborators[5])},'member',${owner})`).rejects.toMatchObject({ message: 'agent_seat_limit_reached' })
    await sql!`insert into public.project_invites(project_key,email,role,invited_by)
      values (${projectA},${email(collaborators[6])},'guest',${owner})`
  })

  it('releases a seat on demotion and atomically converts its reservation on acceptance', async () => {
    await sql!`update public.project_members set role='guest'
      where project_key=${projectA} and user_id=${collaborators[4]}`
    await sql!`insert into public.project_invites(project_key,email,role,invited_by)
      values (${projectA},${email(collaborators[5])},'member',${owner})`
    expect((await sql!`select public.agent_collaborator_usage(${owner}) as usage`)[0].usage).toBe(5)

    const [accepted] = await sql!`select public.accept_project_invite_with_seat(
      ${collaborators[5]},${email(collaborators[5])},${projectA}) as inviter`
    expect(accepted.inviter).toBe(owner)
    expect((await sql!`select public.agent_collaborator_usage(${owner}) as usage`)[0].usage).toBe(5)
    expect((await sql!`select public.accept_project_invite_with_seat(
      ${collaborators[5]},${email(collaborators[5])},${projectA}) as inviter`)[0].inviter).toBeNull()
    await expect(sql!`select public.accept_project_invite_with_seat(
      ${collaborators[7]},${email(collaborators[7])},${projectA})`).rejects.toMatchObject({ message: 'not_found' })
  })

  it('serializes concurrent attempts for the fifth seat', async () => {
    const attempts = await Promise.all(secondCollaborators.slice(4).map((user) =>
      sql!`insert into public.project_members(project_key,user_id,role) values (${projectC},${user},'member')`
        .then(() => 'inserted', (error: { message: string }) => error.message),
    ))
    expect(attempts.sort()).toEqual(['agent_seat_limit_reached', 'inserted'])
    expect((await sql!`select public.agent_collaborator_usage(${secondOwner}) as usage`)[0].usage).toBe(5)
  })

  it('blocks promotions and access approvals at capacity while guests remain free', async () => {
    await sql!`insert into public.project_members(project_key,user_id,role) values (${projectA},${collaborators[7]},'guest')`
    await expect(sql!`select public.change_project_member_role(
      ${projectA},${owner},${collaborators[7]},'member')`).rejects.toMatchObject({ message: 'agent_seat_limit_reached' })

    await sql!`insert into public.project_email_domains(project_key,domain) values (${projectA},'seat.test') on conflict do nothing`
    const [request] = await sql!`insert into public.project_access_requests(project_key,user_id,email)
      values (${projectA},${collaborators[4]},${email(collaborators[4])}) returning id,attempt`
    await expect(sql!`select public.review_project_access_request(
      ${projectA},${request.id},${owner},'approved','member',${request.attempt})`).rejects.toMatchObject({ message: 'agent_seat_limit_reached' })
    const [reviewed] = await sql!`select public.review_project_access_request(
      ${projectA},${request.id},${owner},'approved','guest',${request.attempt}) as result`
    expect(reviewed.result).toMatchObject({ outcome: 'reviewed', request: { granted_role: 'guest' } })
  })

  it('fails collaborators closed for legacy over-limit data and restores access after release', async () => {
    await sql!.begin(async (tx) => {
      await tx`set local session_replication_role = 'replica'`
      await tx`update public.project_members set role='member'
        where project_key=${projectA} and user_id=${collaborators[4]}`
    })
    expect((await sql!`select public.agent_collaborator_usage(${owner}) as usage`)[0].usage).toBe(6)
    expect((await sql!`select public.agent_collaborator_has_seat(${owner},${owner}) as allowed`)[0].allowed).toBe(true)
    expect((await sql!`select public.agent_collaborator_has_seat(${owner},${collaborators[0]}) as allowed`)[0].allowed).toBe(false)
    expect((await sql!`select public.agent_collaborator_has_seat(${owner},${collaborators[7]}) as allowed`)[0].allowed).toBe(false)

    await sql!`update public.project_members set role='guest'
      where project_key=${projectA} and user_id=${collaborators[4]}`
    expect((await sql!`select public.agent_collaborator_has_seat(${owner},${collaborators[0]}) as allowed`)[0].allowed).toBe(true)
  })
})

suite('ownership transfers with collaborator seat enforcement', () => {
  it.each(['member', 'admin'] as const)('promotes a %s to the sole owner and preserves the former owner', async (role) => {
    const project = `transfer-${randomUUID()}`
    await expect(sql!.begin(async (tx) => {
      await tx`insert into public.projects(public_key,slug,name) values (${project},${project},'Transfer regression')`
      await tx`insert into public.project_members(project_key,user_id,role,is_owner) values (${project},${owner},'admin',true), (${project},${collaborators[0]},${role},false)`
      const [result] = await tx`select public.change_project_member_role(${project},${owner},${collaborators[0]},'owner') as result`
      expect(result.result).toMatchObject({ status: 'updated', previousRole: role, role: 'owner' })
      const rows = await tx`select user_id,role,is_owner from public.project_members where project_key=${project} order by is_owner desc`
      expect(rows).toEqual([{ user_id: collaborators[0], role: 'admin', is_owner: true }, { user_id: owner, role: 'admin', is_owner: false }])
      const [denied] = await tx`select public.change_project_member_role(${project},${owner},${owner},'owner') as result`
      expect(denied.result.status).toBe('owner_required')
      const [back] = await tx`select public.change_project_member_role(${project},${collaborators[0]},${owner},'owner') as result`
      expect(back.result.status).toBe('updated')
      expect((await tx`select user_id from public.project_members where project_key=${project} and is_owner`)).toEqual([{ user_id: owner }])
      throw new Error('regression rollback')
    })).rejects.toThrow('regression rollback')
    expect(await sql!`select 1 from public.projects where public_key=${project}`).toHaveLength(0)
  })
})

suite('ownership transfer sponsor capacity', () => {
  it('preserves authorization and rolls back a transfer above reserved capacity', async () => {
    const source = `transfer-cap-source-${randomUUID()}`
    const destination = `transfer-cap-destination-${randomUUID()}`
    const recipient = collaborators[0]
    await expect(sql!.begin(async (tx) => {
      await tx`insert into public.projects(public_key,slug,name) values
        (${source},${source},'Transfer source'), (${destination},${destination},'Recipient project')`
      await tx`insert into public.project_members(project_key,user_id,role,is_owner) values
        (${source},${owner},'admin',true), (${source},${recipient},'member',false),
        (${destination},${recipient},'admin',true)`
      for (const user of secondCollaborators.slice(0, 4)) {
        await tx`insert into public.project_members(project_key,user_id,role) values (${destination},${user},'member')`
      }
      await tx`insert into public.project_invites(project_key,email,role,invited_by)
        values (${destination},${email(secondCollaborators[4])},'member',${recipient})`
      expect((await tx`select public.agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
      const [unauthorized] = await tx`select public.change_project_member_role(${source},${secondOwner},${recipient},'owner') as result`
      expect(unauthorized.result.status).toBe('forbidden')
      await expect(tx.savepoint(async (sp) => {
        await sp`select public.change_project_member_role(${source},${owner},${recipient},'owner')`
      })).rejects.toMatchObject({ message: 'agent_seat_limit_reached' })
      const members = await tx`select user_id,role,is_owner from public.project_members where project_key=${source} order by is_owner desc`
      expect(members).toEqual([
        { user_id: owner, role: 'admin', is_owner: true },
        { user_id: recipient, role: 'member', is_owner: false },
      ])
      expect((await tx`select public.agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
      expect((await tx`select public.agent_collaborator_has_seat(${recipient},${secondCollaborators[0]}) as allowed`)[0].allowed).toBe(true)
      await tx`delete from public.project_invites where project_key=${destination}`
      const [transferred] = await tx`select public.change_project_member_role(${source},${owner},${recipient},'owner') as result`
      expect(transferred.result.status).toBe('updated')
      expect((await tx`select public.agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
      expect(await tx`select user_id from public.project_members where project_key=${source} and is_owner`).toEqual([{ user_id: recipient }])
      throw new Error('regression rollback')
    })).rejects.toThrow('regression rollback')
    expect(await sql!`select 1 from public.projects where public_key in (${source},${destination})`).toHaveLength(0)
  })

  it('serializes competing transfers into the recipient’s final seat', async () => {
    const first = `transfer-race-first-${randomUUID()}`
    const second = `transfer-race-second-${randomUUID()}`
    const destination = `transfer-race-destination-${randomUUID()}`
    const recipient = collaborators[0]
    const otherOwner = collaborators[1]
    try {
      await sql!`insert into public.projects(public_key,slug,name) values
        (${first},${first},'First transfer'), (${second},${second},'Second transfer'),
        (${destination},${destination},'Recipient project')`
      await sql!`insert into public.project_members(project_key,user_id,role,is_owner) values
        (${first},${owner},'admin',true), (${first},${recipient},'member',false),
        (${second},${otherOwner},'admin',true), (${second},${recipient},'member',false),
        (${destination},${recipient},'admin',true)`
      for (const user of secondCollaborators.slice(0, 4)) {
        await sql!`insert into public.project_members(project_key,user_id,role) values (${destination},${user},'member')`
      }
      const results = await Promise.all([[first, owner], [second, otherOwner]].map(([project, actor]) =>
        sql!`select public.change_project_member_role(${project},${actor},${recipient},'owner') as result`
          .then(([row]) => row.result.status, (error: { message: string }) => error.message),
      ))
      expect(results.sort()).toEqual(['agent_seat_limit_reached', 'updated'])
      expect((await sql!`select public.agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
      const [ownership] = await sql!`select count(*)::integer as owned from public.project_members
        where project_key in (${first},${second}) and user_id=${recipient} and is_owner`
      expect(ownership.owned).toBe(1)
      expect((await sql!`select public.agent_collaborator_has_seat(${recipient},${secondCollaborators[0]}) as allowed`)[0].allowed).toBe(true)
    } finally {
      await sql!`delete from public.projects where public_key in (${first},${second},${destination})`
    }
  })
})

async function waitForSeatWriteBlock(pid: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await sql!`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`)[0].blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw Error('Expected seat write to wait for ownership transfer')
}

suite('seat writers racing with ownership transfers', () => {
  it.each(['invite', 'member', 'accept'] as const)('checks the committed new owner for a concurrent %s', async (write) => {
    const source = 'owner-fence-source-' + randomUUID(), destination = 'owner-fence-destination-' + randomUUID()
    const original = collaborators[7], recipient = collaborators[0], newcomer = secondCollaborators[5]
    let release!: () => void, transferred!: () => void, started!: (pid: number) => void
    const proceed = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { transferred = resolve })
    const writing = new Promise<number>(resolve => { started = resolve })
    let transfer: Promise<unknown> | undefined, mutation: Promise<string> | undefined
    try {
      await sql!`insert into projects(public_key,slug,name) values (${source},${source},'Owner fence source'),(${destination},${destination},'Owner fence destination')`
      await sql!`insert into project_members(project_key,user_id,role,is_owner) values (${source},${original},'admin',true),(${source},${recipient},'member',false),(${destination},${recipient},'admin',true)`
      for (const user of secondCollaborators.slice(0, write === 'accept' ? 3 : 4)) {
        await sql!`insert into project_members(project_key,user_id,role) values (${destination},${user},'member')`
      }
      if (write === 'accept') await sql!`insert into project_invites(project_key,email,role,invited_by) values (${source},${email(newcomer)},'member',${original})`
      transfer = sql!.begin(async tx => {
        const [row] = await tx`select change_project_member_role(${source},${original},${recipient},'owner') as result`
        expect(row.result.status).toBe('updated')
        expect((await tx`select agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
        transferred()
        await proceed
      })
      await ready
      mutation = sql!.begin(async tx => {
        started((await tx`select pg_backend_pid() as pid`)[0].pid)
        if (write === 'invite') await tx`insert into project_invites(project_key,email,role,invited_by) values (${source},${email(newcomer)},'member',${original})`
        else if (write === 'member') await tx`insert into project_members(project_key,user_id,role) values (${source},${newcomer},'member')`
        else await tx`select accept_project_invite_with_seat(${newcomer},${email(newcomer)},${source})`
        return 'updated'
      }).then(result => result, (error: { message: string }) => error.message)
      await waitForSeatWriteBlock(await writing)
      release()
      await transfer
      expect(await mutation).toBe(write === 'accept' ? 'updated' : 'agent_seat_limit_reached')
      expect((await sql!`select agent_collaborator_usage(${recipient}) as usage`)[0].usage).toBe(5)
      expect((await sql!`select agent_collaborator_has_seat(${recipient},${secondCollaborators[0]}) as allowed`)[0].allowed).toBe(true)
      if (write === 'accept') {
        expect(await sql!`select user_id from project_members where project_key=${source} and user_id=${newcomer}`).toHaveLength(1)
        expect(await sql!`select email from project_invites where project_key=${source}`).toHaveLength(0)
      } else {
        expect(await sql!`select user_id from project_members where project_key=${source} and user_id=${newcomer}`).toHaveLength(0)
        expect(await sql!`select email from project_invites where project_key=${source}`).toHaveLength(0)
      }
    } finally {
      release?.()
      await transfer?.catch(() => {})
      await mutation
      await sql!`delete from projects where public_key in (${source},${destination})`
    }
  })
})

suite('member row contention preserves the delivery fence', () => {
  it.each(['update', 'delete'] as const)('rejects a direct %s promptly while the project is locked', async (operation) => {
    const project = 'owner-fence-busy-' + randomUUID()
    let release!: () => void, locked!: () => void
    const proceed = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { locked = resolve })
    let holder: Promise<unknown> | undefined
    try {
      await sql!`insert into projects(public_key,slug,name) values (${project},${project},'Member fence contention')`
      await sql!`insert into project_members(project_key,user_id,role,is_owner) values (${project},${collaborators[7]},'admin',true),(${project},${collaborators[0]},'member',false)`
      holder = sql!.begin(async tx => {
        await tx`select 1 from projects where public_key=${project} for update`
        locked()
        await proceed
      })
      await ready
      await expect(sql!.begin(async tx => {
        await tx`set local statement_timeout = '1000ms'`
        if (operation === 'update') await tx`update project_members set role='guest' where project_key=${project} and user_id=${collaborators[0]}`
        else await tx`delete from project_members where project_key=${project} and user_id=${collaborators[0]}`
      })).rejects.toMatchObject({message:'project_membership_busy', code:'55P03'})
      release()
      await holder
      expect((await sql!`select role from project_members where project_key=${project} and user_id=${collaborators[0]}`)[0].role).toBe('member')
    } finally {
      release?.()
      await holder?.catch(() => {})
      await sql!`delete from projects where public_key=${project}`
    }
  })
})
