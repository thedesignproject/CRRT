import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPublicComment, deleteCommentsForProject, ensurePublicProject, listComments, updateReviewStatus } from '../../_lib/store.js'
import { getStringQuery, handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import type { ReviewStatus } from '../../_lib/status.js'
import { getSupabase } from '../../_lib/supabase.js'

const METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
const VALID_STATUSES = new Set(['open', 'accepted', 'approved', 'rejected', 'pending'])

function normalizePatchStatus(value: unknown): ReviewStatus | null {
  if (value === 'accepted' || value === 'approved') return 'accepted'
  if (value === 'rejected') return 'rejected'
  if (value === 'open' || value === 'pending') return 'open'
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  if (req.method === 'PATCH') return handlePatch(req, res)
  if (req.method === 'DELETE') return handleDelete(req, res)
  return methodNotAllowed(req, res, METHODS)
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// Smoke-only cleanup. Gated by SMOKE_CLEANUP_TOKEN and locked to the
// SMOKE_PROJECT_KEY env var so a leaked token cannot wipe a real project.
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  try {
    const expectedToken = process.env.SMOKE_CLEANUP_TOKEN
    const expectedProjectKey = process.env.SMOKE_PROJECT_KEY
    if (!expectedToken || !expectedProjectKey) {
      return jsonError(req, res, 405, 'Cleanup not configured')
    }

    const presented = req.headers['x-smoke-cleanup-token']
    const token = typeof presented === 'string' ? presented : ''
    if (!token || !timingSafeEqual(token, expectedToken)) {
      return jsonError(req, res, 401, 'Invalid cleanup token')
    }

    const projectKey = getStringQuery(req.query.projectKey) ?? getStringQuery(req.query.projectId)
    if (!projectKey || projectKey !== expectedProjectKey) {
      return jsonError(req, res, 403, 'Cleanup scoped to smoke project only')
    }

    await deleteCommentsForProject(projectKey)
    setCors(req, res, METHODS)
    return res.status(204).end()
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  try {
    const projectKey = getStringQuery(req.query.projectKey)
    if (!projectKey) return jsonError(req, res, 400, 'Missing projectKey')

    const pageUrl = getStringQuery(req.query.pageUrl)
    const comments = await listComments(projectKey, pageUrl ? { pageUrl } : {})

    setCors(req, res, METHODS)
    return res.status(200).json(comments)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  try {
    const { id, reviewStatus, status } = req.body ?? {}
    if (typeof id !== 'string' || !id) return jsonError(req, res, 400, 'Missing id')

    const nextStatus = normalizePatchStatus(reviewStatus ?? status)
    if (!nextStatus || !VALID_STATUSES.has(String(reviewStatus ?? status))) {
      return jsonError(req, res, 400, 'reviewStatus must be open, accepted, or rejected')
    }

    const comment = await updateReviewStatus(id, nextStatus)
    setCors(req, res, METHODS)
    return res.status(200).json(comment)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

async function uploadImage(projectKey: string, mimeType: string, base64Data: string): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds 5 MB limit')

  const ext = mimeType.split('/')[1] ?? 'png'
  const path = `${projectKey}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = getSupabase()
  const { error } = await supabase.storage
    .from('feedback-images')
    .upload(path, buffer, { contentType: mimeType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from('feedback-images').getPublicUrl(path)
  return data.publicUrl
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  try {
    const { projectKey, projectId, pageUrl, selector, x, y, body, imageBase64, imageMimeType, authorName } = req.body ?? {}
    const resolvedProjectKey = typeof projectKey === 'string' ? projectKey : projectId

    if (!resolvedProjectKey || !pageUrl || !selector || !body) {
      return jsonError(req, res, 400, 'Missing required fields: projectKey, pageUrl, selector, body')
    }

    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      return jsonError(req, res, 400, 'x and y must be finite numbers')
    }

    let resolvedAuthorName: string | null = null
    if (authorName !== undefined && authorName !== null) {
      if (typeof authorName !== 'string') {
        return jsonError(req, res, 400, 'authorName must be a string')
      }
      const trimmed = authorName.trim()
      if (trimmed.length > 80) {
        return jsonError(req, res, 400, 'authorName must be 80 characters or fewer')
      }
      resolvedAuthorName = trimmed || null
    }

    if (imageBase64 !== undefined) {
      if (typeof imageBase64 !== 'string' || typeof imageMimeType !== 'string') {
        return jsonError(req, res, 400, 'imageBase64 and imageMimeType must both be strings')
      }
      if (!ALLOWED_IMAGE_TYPES.has(imageMimeType)) {
        return jsonError(req, res, 400, 'imageMimeType must be image/png, image/jpeg, image/webp, or image/gif')
      }
    }

    await ensurePublicProject(resolvedProjectKey)

    let imageUrl: string | null = null
    if (imageBase64 && imageMimeType) {
      imageUrl = await uploadImage(resolvedProjectKey, imageMimeType, imageBase64)
    }

    const comment = await createPublicComment({
      projectKey: resolvedProjectKey,
      pageUrl,
      selector,
      x,
      y,
      body,
      imageUrl,
      authorName: resolvedAuthorName,
    })

    setCors(req, res, METHODS)
    return res.status(201).json(comment)
  } catch (error) {
    return jsonError(req, res, 500, error instanceof Error ? error.message : 'Unexpected error')
  }
}
