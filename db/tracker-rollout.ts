import postgres from 'postgres'

// Operational transition only: the caller must first drain and terminate every
// pre-upgrade tracker worker. A timestamp cannot establish sender completion.
export async function transitionLegacyTrackerExports(sql: ReturnType<typeof postgres>, project: string, workersStopped = false) {
  return sql.begin(async tx => {
    if (!await tx`select public_key from projects where public_key=${project} for share`.then(rows => rows.length)) throw new Error('project_not_found')
    const [lock] = await tx`select pg_try_advisory_xact_lock(hashtextextended('crrt-tracker-dispatch:' || ${project},0)) as held`
    if (!lock.held) throw new Error('tracker_dispatch_active')
    await tx`select pg_advisory_xact_lock(hashtextextended('crrt-github-issue:' || ${project},0))`
    const github = await tx`select id as comment, github_issue_lease_token as lease, 'github' as provider from comments
      where project_id=${project} and github_issue_number is null and github_issue_uncertain_at is not null
        and github_issue_lease_token is not null and isfinite(github_issue_lease_expires_at) for update`
    const external = await tx`select id as work, comment_id as comment, lease_token as lease, provider from comment_external_work
      where project_id=${project} and provider in ('linear','jira') and state='creating' and uncertain_at is not null
        and isfinite(lease_expires_at) for update`
    const candidates = [...github, ...external]
    if (workersStopped) for (const row of candidates) {
      await tx`select acknowledge_tracker_dispatch_stopped(${project},${row.comment},${row.lease},${row.work ?? null})`
    }
    return candidates
  })
}

if (import.meta.main) {
  const project = process.argv[2]
  const apply = process.argv.includes('--confirm-legacy-workers-stopped')
  if (!project || !process.env.DATABASE_URL) throw new Error('Usage: DATABASE_URL=... bun db/tracker-rollout.ts PROJECT [--confirm-legacy-workers-stopped]')
  const sql = postgres(process.env.DATABASE_URL, { max: 1 })
  try {
    const rows = await transitionLegacyTrackerExports(sql, project, apply)
    console.log(JSON.stringify({ project, applied: apply, exports: rows }, null, 2))
  } finally { await sql.end() }
}
