import { getServiceSupabase } from './supabase.js'

export async function cleanupDeletedExtensionScreenshots() {
  const db = getServiceSupabase()
  const { data, error } = await db.from('deleted_extension_feedback')
    .select('id,screenshot_storage_path').not('screenshot_storage_path', 'is', null)
    .eq('cleanup_pending',true).lte('cleanup_after',new Date().toISOString())
    .order('cleanup_after').order('id').limit(100)
  if (error) throw new Error(error.message)
  if (!data?.length) return
  const { error: storageError } = await db.storage.from('extension-feedback-images')
    .remove(data.map(row => row.screenshot_storage_path as string))
  // Successful jobs retire from the partial-index queue. Failures stay pending
  // on their own retry schedule, independent of already-cleaned history.
  const { error: updateError } = await db.from('deleted_extension_feedback')
    .update({ cleanup_pending:Boolean(storageError),cleanup_after:new Date(Date.now()+15*60_000).toISOString() }).in('id', data.map(row => row.id))
  if (updateError) throw new Error(updateError.message)
  if (storageError) throw new Error(storageError.message)
}
