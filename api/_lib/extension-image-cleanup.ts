import { getServiceSupabase } from './supabase.js'

type CleanupJob = { storage_path: string; attempts: number }

// Paths are immutable UUIDs and storage removal is idempotent, so overlapping
// cron/immediate workers may safely retry the same durable job.
export async function processExtensionImageCleanup(paths?: string[]) {
  const client = getServiceSupabase()
  let query = client.from('extension_image_cleanup_jobs').select('storage_path,attempts')
  if (paths) query = query.in('storage_path', paths)
  else query = query.lte('next_attempt_at', new Date().toISOString())
  const { data, error } = await query.order('next_attempt_at').limit(100)
  if (error) throw new Error(error.message)
  const jobs = (data as CleanupJob[] | null) ?? []
  for (let offset = 0; offset < jobs.length; offset += 20) {
    await Promise.all(jobs.slice(offset, offset + 20).map(async (job) => {
      try {
        const { error } = await client.storage.from('extension-feedback-images').remove([job.storage_path])
        if (error) throw new Error(error.message)
        const { error: deleteError } = await client.from('extension_image_cleanup_jobs')
          .delete().eq('storage_path', job.storage_path).eq('attempts', job.attempts)
        if (deleteError) throw new Error(deleteError.message)
      } catch (error) {
        console.error('Extension image cleanup deferred', error)
        const delay = Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6))
        const { error: retryError } = await client.from('extension_image_cleanup_jobs').update({
          attempts: job.attempts + 1, next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
        }).eq('storage_path', job.storage_path).eq('attempts', job.attempts)
        if (retryError) throw new Error(retryError.message)
      }
    }))
  }
}
