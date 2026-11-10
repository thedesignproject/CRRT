import { getServiceSupabase } from '../api/_lib/supabase.js'
import { RECORD_BUCKET } from '../api/_lib/record/storage.js'

// Deliberate local provisioning. Storage's schema is not managed by Drizzle.
const endpoint = new URL(process.env.SUPABASE_URL || '')
if (!['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('This command provisions Docker storage only')
const storage = getServiceSupabase().storage
const options = { public: false, fileSizeLimit: 1_073_741_824, allowedMimeTypes: ['video/webm', 'audio/webm', 'image/jpeg', 'image/png'] }
const existing = await storage.getBucket(RECORD_BUCKET)
const result = existing.data ? await storage.updateBucket(RECORD_BUCKET, options) : await storage.createBucket(RECORD_BUCKET, options)
if (result.error) throw result.error
console.log('Private Record storage is ready on Docker')
