import postgres from 'postgres'

// Supabase remains the data query layer. This connection only holds a live
// coordination lock across outbound work, so recovery can prove no sender runs.
export async function withTrackerDispatchLock<T>(projectKey: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const connection = process.env.DATABASE_URL
  if (!connection) throw new Error('tracker_coordination_unavailable')
  const controller = new AbortController()
  const sql = postgres(connection, { max: 1, max_lifetime: null, onclose: () => controller.abort() })
  try {
    return await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock_shared(hashtextextended('crrt-tracker-dispatch:' || ${projectKey},0))`
      controller.signal.throwIfAborted()
      return await work(controller.signal)
    }) as T
  } finally {
    controller.abort()
    await sql.end({ timeout: 5 })
  }
}
