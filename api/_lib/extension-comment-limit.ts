import type { SupabaseClient } from '@supabase/supabase-js'

const LIMIT = 30
const HOUR = 60 * 60 * 1000

// Reserve before uploading/inserting. Deleting a comment never refunds a slot.
// The version predicate makes this atomic across API processes, not just tabs.
export async function reserveExtensionComment(client: SupabaseClient, userId: string): Promise<boolean> {
  const { error: initError } = await client.from('extension_comment_limits')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (initError) throw new Error(initError.message)
  for (let retry = 0; retry <= LIMIT; retry++) {
    const { data, error } = await client.from('extension_comment_limits')
      .select('attempts,version').eq('user_id', userId).single()
    if (error) throw new Error(error.message)
    const now = Date.now()
    const attempts = (data.attempts as string[]).filter((time) => Date.parse(time) > now - HOUR)
    if (attempts.length >= LIMIT) return false
    const { data: reserved, error: updateError } = await client.from('extension_comment_limits')
      .update({ attempts: [...attempts, new Date(now).toISOString()], version: crypto.randomUUID() })
      .eq('user_id', userId).eq('version', data.version).select('user_id').maybeSingle()
    if (updateError) throw new Error(updateError.message)
    if (reserved) return true
  }
  // Fail closed under contention; never upload without a durable reservation.
  return false
}
