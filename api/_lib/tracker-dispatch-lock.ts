import postgres from 'postgres'

// Supabase remains the data query layer. This connection only holds a live
// coordination lock across outbound work, alongside a durable acknowledgment emitted only after the callback settles.
export async function withTrackerDispatchLock<T>(projectKey: string, work: (signal: AbortSignal) => Promise<T>, onStopped: () => Promise<void>): Promise<T> {
  const connection = process.env.DATABASE_URL
  if (!connection) throw new Error('tracker_coordination_unavailable')
  const controller = new AbortController()
  const sql = postgres(connection, { max: 1, max_lifetime: null, onclose: () => controller.abort() })
  try {
    return await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock_shared(hashtextextended('crrt-tracker-dispatch:' || ${projectKey},0))`
      controller.signal.throwIfAborted()
      try {
        return await work(controller.signal)
      } finally {
        // This runs after work settles, never merely because begin() rejects on
        // connection loss. Failed acknowledgments leave recovery blocked.
        await onStopped().catch(() => {})
      }
    }) as T
  } finally {
    controller.abort()
    await sql.end({ timeout: 5 })
  }
}
