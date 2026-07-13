import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ getServiceSupabase: vi.fn() }))

import { getServiceSupabase } from './supabase.js'
import {
  connectGithubRepo,
  deleteGitHubUserInstallation,
  deleteProjectInvite,
  disconnectGithubRepo,
  getGitHubUserInstallation,
  getGithubConnectionVersion,
  getRepoConfig,
  getUserEmailsByIds,
  listProjectInvites,
  listProjectMembers,
  listGitHubUserInstallations,
  normalizeGitHubRepoUrl,
  removeProjectMember,
  updateProject,
  upsertGitHubUserInstallation,
} from './store.js'

type Result = { data: unknown; error: { code?: string; message: string } | null }

// A chainable Supabase stub: every builder method returns the same object, and
// awaiting it (or calling .single/.maybeSingle) resolves to `result`.
function chain(result: Result) {
  const p: Record<string, unknown> = {}
  const self = () => p
  for (const m of ['select', 'update', 'delete', 'insert', 'upsert', 'eq', 'order', 'is', 'in']) p[m] = vi.fn(self)
  p.maybeSingle = () => Promise.resolve(result)
  p.single = () => Promise.resolve(result)
  p.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return p
}

// `from(table)` returns the next queued result for that table, each wrapped in
// a fresh chain — so a function that queries the same table twice gets two.
function supabaseWith(tableResults: Record<string, Result[]>) {
  const queues: Record<string, Result[]> = {}
  for (const [k, v] of Object.entries(tableResults)) queues[k] = [...v]
  return {
    from: vi.fn((table: string) => {
      const q = queues[table]
      return chain(q && q.length ? (q.shift() as Result) : { data: null, error: null })
    }),
    rpc: vi.fn(() => {
      const q = queues.__rpc
      return chain(q && q.length ? (q.shift() as Result) : { data: null, error: null })
    }),
  }
}

// `removeProjectMember` delegates to the `remove_project_member` DB function,
// so its stub mocks `.rpc` (resolving to the function's text result) rather than
// the `from` query chain the other helpers use.
function supabaseRpc(result: Result) {
  return { rpc: vi.fn(() => Promise.resolve(result)) }
}

beforeEach(() => {
  vi.mocked(getServiceSupabase).mockReset()
})

describe('updateProject', () => {
  it('returns the renamed project, defaulting a missing allowlist to []', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      projects: [{ data: [{ public_key: 'p', slug: 'p', name: 'New', created_at: 't', updated_at: 't' }], error: null }],
    }) as never)
    const out = await updateProject('p', { name: 'New' })
    expect(out).toMatchObject({ publicKey: 'p', name: 'New', allowedOrigins: [] })
  })

  it('returns the project with its updated allowlist', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      projects: [{ data: [{ public_key: 'p', slug: 'p', name: 'P', allowed_origins: ['example.com'], created_at: 't', updated_at: 't' }], error: null }],
    }) as never)
    const out = await updateProject('p', { allowedOrigins: ['example.com'] })
    expect(out).toMatchObject({ publicKey: 'p', allowedOrigins: ['example.com'] })
  })

  it('returns null when no row matched', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      projects: [{ data: [], error: null }],
    }) as never)
    expect(await updateProject('missing', { name: 'New' })).toBeNull()
  })

  it('throws on db error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      projects: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(updateProject('p', { name: 'New' })).rejects.toThrow('boom')
  })
})

describe('normalizeGitHubRepoUrl', () => {
  it('normalizes GitHub URLs, shorthand, and .git suffixes', () => {
    expect(normalizeGitHubRepoUrl('https://github.com/Acme/widgets')).toEqual({
      repoUrl: 'https://github.com/Acme/widgets',
      githubOwner: 'Acme',
      githubRepo: 'widgets',
    })
    expect(normalizeGitHubRepoUrl('Acme/widgets.git')).toEqual({
      repoUrl: 'https://github.com/Acme/widgets',
      githubOwner: 'Acme',
      githubRepo: 'widgets',
    })
  })

  it('rejects empty, non-GitHub, and malformed inputs', () => {
    expect(normalizeGitHubRepoUrl('')).toBeNull()
    expect(normalizeGitHubRepoUrl('https://gitlab.com/acme/widgets')).toBeNull()
    expect(normalizeGitHubRepoUrl('https://github.com/acme')).toBeNull()
    expect(normalizeGitHubRepoUrl('acme/widgets/extra')).toBeNull()
    expect(normalizeGitHubRepoUrl('https://github.com/bad_owner/widgets')).toBeNull()
  })
})

describe('getGithubConnectionVersion', () => {
  it('returns the stored safe version and defaults missing or invalid values to zero', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: { github_connection_version: 4 }, error: null }],
    }) as never)
    expect(await getGithubConnectionVersion('p')).toBe(4)

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: null, error: null }],
    }) as never)
    expect(await getGithubConnectionVersion('missing')).toBe(0)

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: { github_connection_version: -1 }, error: null }],
    }) as never)
    expect(await getGithubConnectionVersion('invalid')).toBe(0)
  })

  it('throws on database errors', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(getGithubConnectionVersion('p')).rejects.toThrow('boom')
  })
})

describe('GitHub user installation persistence', () => {
  const installationRow = {
    id: 'opaque-ref',
    user_id: 'user-a',
    installation_id: '99',
    github_account_id: '7',
    github_account_login: 'acme',
    github_account_type: 'Organization',
    last_verified_at: '2026-01-01T00:00:00.000Z',
  }

  it('lists only safe installation choices for the authenticated user', async () => {
    const db = supabaseWith({ github_user_installations: [{ data: [installationRow], error: null }] })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)

    const choices = await listGitHubUserInstallations('user-a')
    expect(choices).toEqual([{
      id: 'opaque-ref',
      githubAccountLogin: 'acme',
      githubAccountType: 'Organization',
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    }])
    expect(JSON.stringify(choices)).not.toContain('99')

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      github_user_installations: [{ data: null, error: null }],
    }) as never)
    await expect(listGitHubUserInstallations('user-a')).resolves.toEqual([])
  })

  it('resolves an installation only through both user id and opaque id', async () => {
    const db = supabaseWith({ github_user_installations: [{ data: installationRow, error: null }] })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(getGitHubUserInstallation('user-a', 'opaque-ref')).resolves.toMatchObject({
      id: 'opaque-ref',
      installationId: '99',
    })

    const builder = db.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-a')
    expect(builder.eq).toHaveBeenCalledWith('id', 'opaque-ref')

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      github_user_installations: [{ data: null, error: null }],
    }) as never)
    await expect(getGitHubUserInstallation('user-b', 'opaque-ref')).resolves.toBeNull()
  })

  it('atomically upserts verified metadata on the user-installation key', async () => {
    const db = supabaseWith({ github_user_installations: [{ data: installationRow, error: null }] })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(upsertGitHubUserInstallation({
      userId: 'user-a',
      installationId: '99',
      githubAccountId: '7',
      githubAccountLogin: 'acme',
      githubAccountType: 'Organization',
    })).resolves.toMatchObject({ id: 'opaque-ref', installationId: '99' })

    const builder = db.from.mock.results[0].value as { upsert: ReturnType<typeof vi.fn> }
    expect(builder.upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id,installation_id' })
  })

  it('deletes mappings with user scope and surfaces database failures', async () => {
    const db = supabaseWith({ github_user_installations: [{ data: null, error: null }] })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(deleteGitHubUserInstallation('user-a', 'opaque-ref')).resolves.toBeUndefined()
    const builder = db.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-a')
    expect(builder.eq).toHaveBeenCalledWith('id', 'opaque-ref')

    for (const operation of [
      () => listGitHubUserInstallations('user-a'),
      () => getGitHubUserInstallation('user-a', 'opaque-ref'),
      () => upsertGitHubUserInstallation({
        userId: 'user-a',
        installationId: '99',
        githubAccountId: '7',
        githubAccountLogin: 'acme',
        githubAccountType: 'Organization' as const,
      }),
      () => deleteGitHubUserInstallation('user-a', 'opaque-ref'),
    ]) {
      vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
        github_user_installations: [{ data: null, error: { message: 'boom' } }],
      }) as never)
      await expect(operation()).rejects.toThrow('boom')
    }
  })
})

describe('getRepoConfig', () => {
  it('marks a legacy repository without an installation as requiring reconnection', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: {
        project_key: 'p',
        repo_url: 'https://github.com/acme/widgets',
        github_owner: 'acme',
        github_repo: 'widgets',
        github_installation_id: null,
        local_path: null,
        default_branch: 'main',
        install_command: null,
        dev_command: null,
        test_command: null,
        build_command: null,
        agent_instructions: null,
      }, error: null }],
    }) as never)
    await expect(getRepoConfig('p')).resolves.toMatchObject({
      githubConnectionStatus: 'reconnect_required',
    })
  })

  it('returns null when the project has no repository config', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: null, error: null }],
    }) as never)
    await expect(getRepoConfig('missing')).resolves.toBeNull()
  })

  it('surfaces repository config query errors', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(getRepoConfig('p')).rejects.toThrow('boom')
  })
})

describe('race-safe GitHub connection persistence', () => {
  const connectedRow = {
    project_key: 'p',
    repo_url: 'https://github.com/acme/widgets',
    github_owner: 'acme',
    github_repo: 'widgets',
    github_installation_id: '99',
    local_path: null,
    default_branch: 'main',
    install_command: null,
    dev_command: null,
    test_command: null,
    build_command: null,
    agent_instructions: null,
  }

  it('connects only when the expected version matches', async () => {
    const db = supabaseWith({ __rpc: [{ data: connectedRow, error: null }] })
    vi.mocked(getServiceSupabase).mockReturnValue(db as never)
    await expect(connectGithubRepo('p', 'u', 'acme/widgets', '99', 4)).resolves.toMatchObject({
      githubConnectionStatus: 'connected',
      githubOwner: 'acme',
      githubRepo: 'widgets',
    })
    expect(db.rpc).toHaveBeenCalledWith('write_github_repo_connection_if_admin', {
      p_project_key: 'p',
      p_user_id: 'u',
      p_expected_version: 4,
      p_repo_url: 'https://github.com/acme/widgets',
      p_github_owner: 'acme',
      p_github_repo: 'widgets',
      p_github_installation_id: '99',
    })

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      __rpc: [{ data: null, error: null }],
    }) as never)
    await expect(connectGithubRepo('p', 'u', 'acme/widgets', '99', 4)).rejects.toThrow('stale_connection_attempt')
  })

  it('validates connect input and surfaces database errors', async () => {
    await expect(connectGithubRepo('p', 'u', 'not-a-repo', '99', 0)).rejects.toThrow('invalid_github_repo')

    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      __rpc: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(connectGithubRepo('p', 'u', 'acme/widgets', '99', 0)).rejects.toThrow('boom')
  })

  it('retries disconnect conflicts and returns the winning disconnected state', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [
        { data: { github_connection_version: 4 }, error: null },
        { data: { github_connection_version: 5 }, error: null },
      ],
      __rpc: [
        { data: null, error: null },
        { data: { ...connectedRow, repo_url: null, github_owner: null, github_repo: null, github_installation_id: null }, error: null },
      ],
    }) as never)

    await expect(disconnectGithubRepo('p', 'u')).resolves.toMatchObject({
      repoUrl: null,
      githubConnectionStatus: 'disconnected',
    })
  })

  it('fails closed after repeated disconnect contention', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [
        { data: { github_connection_version: 1 }, error: null },
        { data: { github_connection_version: 2 }, error: null },
        { data: { github_connection_version: 3 }, error: null },
      ],
      __rpc: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    }) as never)

    await expect(disconnectGithubRepo('p', 'u')).rejects.toThrow('stale_connection_attempt')
  })

  it('does not retry a failed disconnect database write', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_repo_configs: [
        { data: { github_connection_version: 1 }, error: null },
      ],
      __rpc: [
        { data: null, error: { message: 'boom' } },
      ],
    }) as never)

    await expect(disconnectGithubRepo('p', 'u')).rejects.toThrow('boom')
  })
})

describe('listProjectMembers', () => {
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey
  })

  it('maps rows with null emails when no service key is configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_members: [{ data: [{ user_id: 'u1', role: 'admin', created_at: 't' }], error: null }],
    }) as never)
    const out = await listProjectMembers('p')
    expect(out).toEqual([{ userId: 'u1', email: null, role: 'admin', createdAt: 't' }])
  })

  it('returns an empty roster when the table yields no rows', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_members: [{ data: null, error: null }],
    }) as never)
    expect(await listProjectMembers('p')).toEqual([])
  })

  it('throws on db error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_members: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(listProjectMembers('p')).rejects.toThrow('boom')
  })
})

describe('removeProjectMember', () => {
  it('returns false when the member is not in the project', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseRpc({ data: 'not_found', error: null }) as never)
    expect(await removeProjectMember('p', 'gone')).toBe(false)
  })

  it('refuses to remove the last admin', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseRpc({ data: 'last_admin', error: null }) as never)
    await expect(removeProjectMember('p', 'a')).rejects.toThrow('last_admin')
  })

  it('removes a member when the guard passes', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseRpc({ data: 'removed', error: null }) as never)
    expect(await removeProjectMember('p', 'a')).toBe(true)
  })

  it('throws when the rpc errors', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseRpc({ data: null, error: { message: 'boom' } }) as never)
    await expect(removeProjectMember('p', 'a')).rejects.toThrow('boom')
  })
})

describe('getUserEmailsByIds', () => {
  const origFetch = globalThis.fetch
  const origUrl = process.env.SUPABASE_URL
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supa.example'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key'
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    process.env.SUPABASE_URL = origUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey
  })

  it('returns an empty map for no ids', async () => {
    expect(await getUserEmailsByIds([])).toEqual({})
  })

  it('returns an empty map when service config is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(await getUserEmailsByIds(['u1'])).toEqual({})
  })

  it('resolves emails, dedupes ids, and skips failures', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/ok')) {
        return new Response(JSON.stringify({ email: 'a@b.c' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/noemail')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.endsWith('/boom')) throw new Error('net')
      return new Response('nope', { status: 500 }) // /bad
    }) as never
    const out = await getUserEmailsByIds(['ok', 'ok', 'bad', 'noemail', 'boom'])
    expect(out).toEqual({ ok: 'a@b.c' })
  })
})

describe('listProjectInvites', () => {
  it('returns mapped invites', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: [{ project_key: 'p', email: 'x@y.z', role: 'member', invited_by: 'u', created_at: 't' }], error: null }],
    }) as never)
    const out = await listProjectInvites('p')
    expect(out).toEqual([{ projectKey: 'p', email: 'x@y.z', role: 'member', invitedBy: 'u', createdAt: 't' }])
  })

  it('returns an empty list when the table yields no rows', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: null, error: null }],
    }) as never)
    expect(await listProjectInvites('p')).toEqual([])
  })

  it('throws on db error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(listProjectInvites('p')).rejects.toThrow('boom')
  })
})

describe('deleteProjectInvite', () => {
  it('returns true when a row was deleted', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: [{ email: 'x@y.z' }], error: null }],
    }) as never)
    expect(await deleteProjectInvite('p', 'X@Y.Z')).toBe(true)
  })

  it('returns false when nothing matched', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: [], error: null }],
    }) as never)
    expect(await deleteProjectInvite('p', 'x@y.z')).toBe(false)
  })

  it('throws on db error', async () => {
    vi.mocked(getServiceSupabase).mockReturnValue(supabaseWith({
      project_invites: [{ data: null, error: { message: 'boom' } }],
    }) as never)
    await expect(deleteProjectInvite('p', 'x@y.z')).rejects.toThrow('boom')
  })
})
