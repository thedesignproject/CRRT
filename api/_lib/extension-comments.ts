import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabase } from './supabase.js'
import { parseCommentTarget } from './anchor.js'
import { reserveExtensionComment } from './extension-comment-limit.js'

const BUCKET = 'extension-feedback-images'
const SELECT = 'id,url,page_hostname,x,y,element,comment,screenshot_storage_path,created_at,updated_at,target_type,anchor'
const MAX_BODY = 8_000
const MAX_SELECTOR = 1_000
const MAX_URL = 2_048
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export class ExtensionCommentError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type CommentRow = {
  id: string
  url: string
  page_hostname: string
  x: number
  y: number
  element: string
  comment: string
  screenshot_storage_path: string | null
  created_at: string
  updated_at: string
  target_type: string
  anchor: Record<string, unknown> | null
}

export type ExtensionComment = {
  id: string
  pageUrl: string
  pageHostname: string
  x: number
  y: number
  selector: string
  body: string
  screenshotUrl: string | null
  createdAt: string
  updatedAt: string
  targetType: string
  anchor: Record<string, unknown> | null
}

export function normalizeExtensionPageUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_URL) {
    throw new ExtensionCommentError(400, 'pageUrl must be between 1 and 2048 characters')
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ExtensionCommentError(400, 'pageUrl must be a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ExtensionCommentError(400, 'pageUrl must use http or https')
  }
  parsed.hash = ''
  return { pageUrl: parsed.toString(), pageHostname: parsed.hostname.toLowerCase() }
}

export function parseExtensionPagination(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1)
  const limit = Number(query.limit ?? 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ExtensionCommentError(400, 'page must be positive and limit must be between 1 and 50')
  }
  return { page, limit }
}

function requiredText(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ExtensionCommentError(400, `${name} must be between 1 and ${max} characters`)
  }
  return value.trim()
}

function position(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ExtensionCommentError(400, `${name} must be a number between 0 and 100`)
  }
  return value
}

function parseScreenshot(input: unknown) {
  if (input === undefined || input === null) return null
  const value = input as { base64?: unknown; mimeType?: unknown }
  if (typeof value.base64 !== 'string' || typeof value.mimeType !== 'string' || !IMAGE_TYPES.has(value.mimeType)) {
    throw new ExtensionCommentError(400, 'screenshot must be a PNG, JPEG, or WebP image')
  }
  const buffer = Buffer.from(value.base64, 'base64')
  if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ExtensionCommentError(400, 'screenshot must be between 1 byte and 5 MB')
  }
  return { buffer, mimeType: value.mimeType }
}

async function serialize(client: SupabaseClient, row: CommentRow): Promise<ExtensionComment> {
  let screenshotUrl: string | null = null
  if (row.screenshot_storage_path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(row.screenshot_storage_path, 300)
    // A retried DELETE can leave a row after its image was already removed.
    if (error && error.message !== 'Object not found') throw new Error(`Screenshot signing failed: ${error.message}`)
    screenshotUrl = data?.signedUrl ?? null
  }
  return {
    id: row.id,
    pageUrl: row.url,
    pageHostname: row.page_hostname,
    x: row.x,
    y: row.y,
    selector: row.element,
    body: row.comment,
    screenshotUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetType: row.target_type,
    anchor: row.anchor,
  }
}

export async function listExtensionComments(
  userId: string,
  input: { page?: unknown; limit?: unknown; pageUrl?: unknown },
) {
  const client = getServiceSupabase()
  const { page, limit } = parseExtensionPagination(input)
  let query = client.from('comments').select(SELECT, { count: 'exact' })
    .eq('source', 'extension').eq('created_by_user_id', userId)
    .order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (input.pageUrl !== undefined) query = query.eq('url', normalizeExtensionPageUrl(input.pageUrl).pageUrl)
  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { items: await Promise.all(((data ?? []) as CommentRow[]).map((row) => serialize(client, row))), page, limit, total: count ?? 0 }
}

export async function createExtensionComment(userId: string, input: Record<string, unknown>) {
  const client = getServiceSupabase()
  const { pageUrl, pageHostname } = normalizeExtensionPageUrl(input.pageUrl)
  const body = requiredText(input.body, 'body', MAX_BODY)
  const selector = requiredText(input.selector, 'selector', MAX_SELECTOR)
  const x = position(input.x, 'x')
  const y = position(input.y, 'y')
  const screenshot = parseScreenshot(input.screenshot)
  const target = parseCommentTarget(input.targetType, input.anchor)
  if (!target.ok) throw new ExtensionCommentError(400, target.error)
  if (!await reserveExtensionComment(client, userId)) throw new ExtensionCommentError(429, 'Comment limit reached; try again later')

  let screenshotStoragePath: string | null = null
  if (screenshot) {
    const ext = screenshot.mimeType === 'image/jpeg' ? 'jpg' : screenshot.mimeType.split('/')[1]
    screenshotStoragePath = `${userId}/${crypto.randomUUID()}.${ext}`
  }

  const { data, error } = await client.from('comments').insert({
    source: 'extension', created_by_user_id: userId, project_id: null,
    url: pageUrl, page_hostname: pageHostname, x, y, element: selector,
    comment: body, created_by: 'extension', screenshot_storage_path: screenshotStoragePath,
    target_type: target.targetType, anchor: target.anchor,
  }).select(SELECT).single()
  if (error) throw new Error(error.message)
  // Persist the cleanup reference before writing an object. If upload and its
  // rollback both fail, the owned row remains visible and DELETE is retryable.
  if (screenshot && screenshotStoragePath) {
    const { error: uploadError } = await client.storage.from(BUCKET).upload(screenshotStoragePath, screenshot.buffer, {
      contentType: screenshot.mimeType, upsert: false,
    })
    if (uploadError) {
      try { await deleteExtensionComment(userId, data.id) }
      catch { throw new Error('Screenshot upload failed; comment retained for cleanup. Reload your comments before retrying.') }
      throw new Error(`Screenshot upload failed: ${uploadError.message}`)
    }
  }
  return serialize(client, data as CommentRow)
}

export async function updateExtensionComment(userId: string, commentId: string, bodyValue: unknown) {
  const body = requiredText(bodyValue, 'body', MAX_BODY)
  const client = getServiceSupabase()
  const { data, error } = await client.from('comments').update({ comment: body, updated_at: new Date().toISOString() })
    .eq('id', commentId).eq('source', 'extension').eq('created_by_user_id', userId).select(SELECT).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ExtensionCommentError(404, 'Comment not found')
  return serialize(client, data as CommentRow)
}

export async function deleteExtensionComment(userId: string, commentId: string) {
  const client = getServiceSupabase()
  const { data, error } = await client.from('comments')
    .select('screenshot_storage_path')
    .eq('id', commentId).eq('source', 'extension').eq('created_by_user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ExtensionCommentError(404, 'Comment not found')
  if (data.screenshot_storage_path) {
    const { error: storageError } = await client.storage.from(BUCKET).remove([data.screenshot_storage_path])
    if (storageError) throw new Error(`Screenshot deletion failed: ${storageError.message}`)
  }
  // Retain the row/path on storage failure so a later DELETE can retry cleanup.
  const { error: deleteError } = await client.from('comments').delete()
    .eq('id', commentId).eq('source', 'extension').eq('created_by_user_id', userId)
  if (deleteError) throw new Error(deleteError.message)
}
