import { getServiceSupabase } from './supabase.js'

// Copy existing widget screenshots before enabling privacy. Delete their old
// public objects before reporting success; failed runs can safely be retried.
export async function protectProjectScreenshots(projectKey: string) {
  const db = getServiceSupabase()
  for (;;) {
    const { data, error } = await db.from('comments').select('id,image_url,screenshot_storage_path')
      .eq('project_id', projectKey).eq('source', 'widget').not('image_url', 'is', null).order('id').range(0, 99)
    if (error) throw new Error('Could not load project screenshots')
    for (const row of data ?? []) {
      if (!row.image_url) continue
      const url = new URL(row.image_url)
      const base = new URL(process.env.SUPABASE_URL!)
      const prefix = '/storage/v1/object/public/feedback-images/'
      if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) throw new Error('Screenshot needs manual protection before enabling privacy')
      const path = decodeURIComponent(url.pathname.slice(prefix.length))
      if (!path.startsWith(`${projectKey}/`)) throw new Error('Screenshot is outside this project')
      const privatePath = row.screenshot_storage_path ?? `widget/${projectKey}/${row.id}`
      if (!row.screenshot_storage_path) {
        const download = await db.storage.from('feedback-images').download(path)
        if (download.error || !download.data) throw new Error('Could not read existing screenshot')
        const upload = await db.storage.from('extension-feedback-images').upload(privatePath, download.data, { contentType: download.data.type, upsert: true })
        if (upload.error) throw new Error('Could not protect existing screenshot')
        const saved = await db.from('comments').update({ screenshot_storage_path: privatePath }).eq('id', row.id).eq('project_id', projectKey)
        if (saved.error) throw new Error('Could not save protected screenshot')
      }
      const removed = await db.storage.from('feedback-images').remove([path])
      if (removed.error) throw new Error('Could not remove public screenshot')
      const saved = await db.from('comments').update({ image_url: null }).eq('id', row.id).eq('project_id', projectKey)
      if (saved.error) throw new Error('Could not finish protecting screenshot')
    }
    if (!data || data.length < 100) break
  }
}

export async function removeRestrictedNotifications(projectKey: string) {
  const db = getServiceSupabase()
  const members = await db.from('project_members').select('user_id').eq('project_key', projectKey).neq('role', 'admin')
  if (members.error) throw new Error('Could not load notification access')
  const ids = (members.data ?? []).map((member) => member.user_id)
  if (!ids.length) return
  const removed = await db.from('notifications').delete().in('user_id', ids).eq('kind', 'comment.activity').eq('payload->>projectKey', projectKey)
  if (removed.error) throw new Error('Could not protect existing notifications')
}
