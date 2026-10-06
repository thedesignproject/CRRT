import postgres from 'postgres'

// Supabase remains the data query layer. This connection only holds a live
// coordination lock across outbound work, alongside a durable acknowledgment emitted after callback settlement or confirmed failure to start.
export async function withTrackerDispatchLock<T>(projectKey: string, work: (signal: AbortSignal) => Promise<T>, onStopped: () => Promise<void>): Promise<T> {
  const connection = process.env.DATABASE_URL
  const controller = new AbortController()
  let started = false
  let sql: ReturnType<typeof postgres> | undefined
  try {
    if (!connection) throw new Error('tracker_coordination_unavailable')
    sql = postgres(connection, { max: 1, max_lifetime: null, onclose: () => controller.abort() })
    return await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock_shared(hashtextextended('crrt-tracker-dispatch:' || ${projectKey},0))`
      controller.signal.throwIfAborted()
      started = true
      try {
        return await work(controller.signal)
      } finally {
        // This runs after work settles, never merely because begin() rejects on
        // connection loss. Failed acknowledgments leave recovery blocked.
        await onStopped().catch(() => {})
      }
    }) as T
  } finally {
    // Abort first: a delayed lock response must never start work after setup
    // failure has acknowledged this lease. Once started, only the inner finally
    // may acknowledge, even if begin() rejects before the callback settles.
    controller.abort()
    if (!started) await onStopped().catch(() => {})
    if (sql) await sql.end({ timeout: 5 })
  }
}
