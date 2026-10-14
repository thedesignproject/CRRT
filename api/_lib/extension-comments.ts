import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabase } from './supabase.js'
import { parseCommentTarget } from './anchor.js'
import { reserveExtensionComment } from './extension-comment-limit.js'
import { uploadExtensionScreenshot } from './extension-screenshot-upload.js'
import { processExtensionImageCleanup } from './extension-image-cleanup.js'
import { fromLegacyStatus } from './status.js'

const BUCKET = 'extension-feedback-images'
const SELECT = 'id,project_id,source,created_by_user_id,url,page_hostname,x,y,element,comment,status,visibility,image_url,screenshot_storage_path,author_name,created_at,updated_at,target_type,anchor'
const MAX_BODY = 8_000
const MAX_SELECTOR = 1_000
const MAX_URL = 2_048
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_BULK_IDS = 500
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ExtensionCommentError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type CommentRow = {
  id: string
  project_id: string | null
  source?: string | null
  created_by_user_id?: string | null
  url: string
  page_hostname: string
  x: number
  y: number
  element: string
  comment: string
  status?: string | null
  visibility?: 'shared' | 'internal' | null
  image_url?: string | null
  screenshot_storage_path: string | null
  author_name: string | null
  created_at: string
  updated_at: string
  target_type: string
  anchor: Record<string, unknown> | null
}

export type ExtensionComment = {
  id: string
  projectId: string | null
  pageUrl: string
  pageHostname: string
  x: number
  y: number
  selector: string
  body: string
  visibility?: 'shared' | 'internal'
  reviewStatus?: 'open' | 'accepted' | 'rejected'
  editable?: boolean
  screenshotUrl: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
  targetType: string
  anchor: Record<string, unknown> | null
}

export type ExtensionCommentBulkSelection =
  | { mode: 'ids'; ids: string[] }
  | { mode: 'all'; excludedIds: string[] }

export type ExtensionCommentBulkResult = {
  processedIds: string[]
  skipped: Array<{ id: string; reason: 'not_in_inbox' | 'concurrent_change' | 'storage_delete_failed' | 'mutation_failed' | 'access_changed' }>
  selectedTotal: number
}

type InboxBulkRow = { id: string; screenshot_storage_path: string | null }

function bulkIds(value: unknown, name: string, allowEmpty: boolean) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > MAX_BULK_IDS) {
    throw new ExtensionCommentError(400, `${name} must contain ${allowEmpty ? `at most ${MAX_BULK_IDS}` : `between 1 and ${MAX_BULK_IDS}`} comment ids`)
  }
  const ids = [...new Set(value)]
  if (ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    throw new ExtensionCommentError(400, `${name} must contain valid comment ids`)
  }
  return ids as string[]
}

export function parseExtensionCommentBulkSelection(value: unknown): ExtensionCommentBulkSelection {
  if (!value || typeof value !== 'object') throw new ExtensionCommentError(400, 'selection is required')
  const selection = value as { mode?: unknown; ids?: unknown; excludedIds?: unknown }
  if (selection.mode === 'ids') return { mode: 'ids', ids: bulkIds(selection.ids, 'selection.ids', false) }
  if (selection.mode === 'all') return { mode: 'all', excludedIds: bulkIds(selection.excludedIds ?? [], 'selection.excludedIds', true) }
  throw new ExtensionCommentError(400, 'selection.mode must be ids or all')
}

async function resolveInboxBulkRows(userId: string, selection: ExtensionCommentBulkSelection) {
  const client = getServiceSupabase()
  const rows: InboxBulkRow[] = []
  const excluded = new Set(selection.mode === 'all' ? selection.excludedIds : [])
  let cursor: string | undefined
  // Keyset pagination survives rows disappearing between pages without skipping
  // the next page, and never relies on PostgREST's default row cap.
  for (;;) {
    let query = client.from('comments').select('id,screenshot_storage_path')
      .eq('source', 'extension').eq('created_by_user_id', userId).is('project_id', null)
      .order('id', { ascending: true }).limit(500)
    if (selection.mode === 'ids') query = query.in('id', selection.ids)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const page = (data as InboxBulkRow[] | null) ?? []
    rows.push(...page.filter((row) => !excluded.has(row.id)))
    if (page.length < 500) break
    cursor = page[page.length - 1]!.id
  }
  return rows
}

function missingSelectionIds(selection: ExtensionCommentBulkSelection, rows: InboxBulkRow[]) {
  if (selection.mode !== 'ids') return []
  const found = new Set(rows.map((row) => row.id))
  return selection.ids.filter((id) => !found.has(id))
}

export async function bulkAssignExtensionCommentsToProject(
  userId: string,
  selection: ExtensionCommentBulkSelection,
  projectId: string,
  visibility: 'shared' | 'internal' = 'shared',
): Promise<ExtensionCommentBulkResult> {
  const rows = await resolveInboxBulkRows(userId, selection)
  const skipped: ExtensionCommentBulkResult['skipped'] = missingSelectionIds(selection, rows)
    .map((id) => ({ id, reason: 'not_in_inbox' }))
  if (rows.length === 0) return { processedIds: [], skipped, selectedTotal: selection.mode === 'ids' ? selection.ids.length : 0 }

  const client = getServiceSupabase()
  const processedIds: string[] = []
  for (let offset = 0; offset < rows.length; offset += 500) {
    try {
      const { data, error } = await client.rpc('assign_actor_inbox_feedback', {
        p_actor: userId, p_project: projectId, p_ids: rows.slice(offset, offset + 500).map((row) => row.id), p_visibility: visibility,
      })
      if (error) {
        if (error.message === 'forbidden') throw new ExtensionCommentError(403, 'Project access changed. Review the destination and retry.')
        throw new Error(error.message)
      }
      processedIds.push(...((data as Array<{ id: string }> | null) ?? []).map((row) => row.id))
    } catch (error) {
      if (processedIds.length === 0) throw error
      const reason = error instanceof ExtensionCommentError ? 'access_changed' : 'mutation_failed'
      skipped.push(...rows.slice(offset).map((row) => ({ id: row.id, reason } as const)))
      break
    }
  }
  const processed = new Set([...processedIds, ...skipped.map((item) => item.id)])
  for (const row of rows) {
    if (!processed.has(row.id)) skipped.push({ id: row.id, reason: 'concurrent_change' })
  }
  return {
    processedIds,
    skipped,
    selectedTotal: selection.mode === 'ids' ? selection.ids.length : rows.length,
  }
}

export async function bulkDeleteExtensionComments(
  userId: string,
  selection: ExtensionCommentBulkSelection,
): Promise<ExtensionCommentBulkResult> {
  const rows = await resolveInboxBulkRows(userId, selection)
  const skipped: ExtensionCommentBulkResult['skipped'] = missingSelectionIds(selection, rows)
    .map((id) => ({ id, reason: 'not_in_inbox' }))
  const client = getServiceSupabase()
  const deletedRows: InboxBulkRow[] = []
  // Only the row snapshots returned by DELETE may have their images removed.
  // A concurrent move, ownership change, or failed DELETE retains its image.
  for (let offset = 0; offset < rows.length; offset += 100) {
    try {
      const { data, error } = await client.from('comments').delete()
        .eq('source', 'extension').eq('created_by_user_id', userId).is('project_id', null)
        .in('id', rows.slice(offset, offset + 100).map((row) => row.id))
        .select('id,screenshot_storage_path')
      if (error) throw new Error(error.message)
      const batch = (data as InboxBulkRow[] | null) ?? []
      deletedRows.push(...batch)
      const paths = batch.flatMap((row) => row.screenshot_storage_path ? [row.screenshot_storage_path] : [])
      if (paths.length) {
        try { await processExtensionImageCleanup(paths) }
        catch (error) { console.error('Inbox image cleanup deferred to durable queue', error) }
      }
    } catch (error) {
      if (deletedRows.length === 0) throw error
      skipped.push(...rows.slice(offset).map((row) => ({ id: row.id, reason: 'mutation_failed' } as const)))
      break
    }
  }
  const processedIds = deletedRows.map((row) => row.id)
  const processed = new Set([...processedIds, ...skipped.map((item) => item.id)])
  for (const row of rows) {
    if (!processed.has(row.id)) skipped.push({ id: row.id, reason: 'concurrent_change' })
  }

  return {
    processedIds,
    skipped,
    selectedTotal: selection.mode === 'ids' ? selection.ids.length : rows.length,
  }
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

export function parseScreenshot(input: unknown) {
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

async function serialize(client: SupabaseClient, row: CommentRow, viewerUserId?: string): Promise<ExtensionComment> {
  let screenshotUrl: string | null = row.image_url ?? null
  if (row.screenshot_storage_path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(row.screenshot_storage_path, 300)
    // A retried DELETE can leave a row after its image was already removed.
    if (error && error.message !== 'Object not found') throw new Error(`Screenshot signing failed: ${error.message}`)
    screenshotUrl = data?.signedUrl ?? null
  }
  return {
    id: row.id,
    projectId: row.project_id,
    pageUrl: row.url,
    pageHostname: row.page_hostname,
    x: row.x,
    y: row.y,
    selector: row.element,
    body: row.comment,
    visibility: row.visibility ?? 'shared',
    reviewStatus: fromLegacyStatus(row.status),
    editable: row.source === 'extension' && row.created_by_user_id === viewerUserId,
    screenshotUrl,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetType: row.target_type,
    anchor: row.anchor,
  }
}

function hasRenderableTarget(row: unknown): row is CommentRow {
  const value = row as Partial<CommentRow>
  return typeof value.url === 'string'
    && typeof value.element === 'string'
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y)
}

export async function listExtensionComments(
  userId: string,
  input: { page?: unknown; limit?: unknown; pageUrl?: unknown; projectId?: string | null },
  visibility?: 'shared' | 'internal',
) {
  const client = getServiceSupabase()
  const { page, limit } = parseExtensionPagination(input)
  let query = (input.projectId
    ? client.rpc('read_project_feedback', { p_project: input.projectId, p_actor: userId } as never)
    : client.from('comments')).select(SELECT, { count: 'exact' })
  if (input.projectId) {
    query = query.eq('project_id', input.projectId)
      .not('url', 'is', null)
      .not('element', 'is', null)
      .not('x', 'is', null)
      .not('y', 'is', null)
  } else {
    query = query.eq('source', 'extension').eq('created_by_user_id', userId).is('project_id', null)
  }
  if (visibility) query = query.eq('visibility', visibility)
  query = query.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1)
  if (input.pageUrl !== undefined) query = query.eq('url', normalizeExtensionPageUrl(input.pageUrl).pageUrl)
  const { data, error, count } = await query
  if (error) {
    if (error.message === 'forbidden') throw new ExtensionCommentError(403, 'Forbidden')
    throw new Error(error.message)
  }
  const renderable = ((data as unknown as Parameters<typeof serialize>[1][] | null) ?? []).filter(hasRenderableTarget)
  return { items: await Promise.all(renderable.map((row) => serialize(client, row, userId))), page, limit, total: count ?? 0 }
}

export async function createExtensionComment(
  userId: string,
  input: Record<string, unknown>,
  projectId: string | null = null,
  authorName: string | null = null,
  visibility: 'shared' | 'internal' = 'shared',
) {
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
    source: 'extension', created_by_user_id: userId, project_id: projectId, visibility,
    url: pageUrl, page_hostname: pageHostname, x, y, element: selector,
    comment: body, created_by: 'extension', author_name: authorName,
    screenshot_storage_path: screenshotStoragePath,
    target_type: target.targetType, anchor: target.anchor,
  }).select(SELECT).single()
  if (error) throw new Error(error.message)
  // Persist the cleanup reference before writing an object. If upload and its
  // rollback both fail, durable deletion receipts remain eligible for cleanup.
  if (screenshot && screenshotStoragePath) {
    let uploadError:{message:string}|null
    try { ({error:uploadError}=await uploadExtensionScreenshot(client,userId,data.id,screenshotStoragePath,screenshot.buffer,screenshot.mimeType)) }
    catch(error){uploadError={message:error instanceof Error ? error.message : 'Upload unavailable'}}
    if (uploadError) {
      try { await deleteExtensionComment(userId, data.id) }
      catch { throw new Error('Screenshot upload failed; cleanup reference retained. Reload your comments before retrying.') }
      throw new Error(`Screenshot upload failed: ${uploadError.message}`)
    }
  }
  return serialize(client, data as CommentRow, userId)
}

export async function updateExtensionComment(userId: string, commentId: string, bodyValue: unknown) {
  const body = requiredText(bodyValue, 'body', MAX_BODY)
  const client = getServiceSupabase()
  const { data, error } = await client.from('comments').update({ comment: body, updated_at: new Date().toISOString() })
    .eq('id', commentId).eq('source', 'extension').eq('created_by_user_id', userId).select(SELECT).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ExtensionCommentError(404, 'Comment not found')
  return serialize(client, data as CommentRow, userId)
}

export async function getOwnedExtensionCommentScope(userId: string, commentId: string) {
  const client = getServiceSupabase()
  const { data, error } = await client.from('comments')
    .select('project_id,visibility')
    .eq('id', commentId)
    .eq('source', 'extension')
    .eq('created_by_user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? {
    projectId: data.project_id as string | null,
    visibility: (data.visibility ?? 'shared') as 'shared' | 'internal',
  } : null
}

export async function assignExtensionCommentToProject(
  userId: string,
  commentId: string,
  projectId: string,
  visibility: 'shared' | 'internal' = 'shared',
) {
  const client = getServiceSupabase()
  const { error } = await client.rpc('assign_actor_inbox_feedback', {
    p_actor: userId, p_project: projectId, p_ids: [commentId], p_visibility: visibility,
  })
  if (error) {
    if (error.message === 'forbidden') throw new ExtensionCommentError(403, 'Project access changed. Review the destination and retry.')
    throw new Error(error.message)
  }

  const { data: current, error: currentError } = await client.from('comments')
    .select(SELECT)
    .eq('id', commentId)
    .eq('source', 'extension')
    .eq('created_by_user_id', userId)
    .maybeSingle()
  if (currentError) throw new Error(currentError.message)
  if (!current) throw new ExtensionCommentError(404, 'Comment not found')
  if ((current as CommentRow).project_id !== projectId) {
    throw new ExtensionCommentError(409, 'Comment already belongs to another project')
  }
  return serialize(client, current as CommentRow, userId)
}

export async function deleteExtensionComment(userId: string, commentId: string, cleanupOnly = false) {
  const client = getServiceSupabase()
  // Delete + durable cleanup receipt commit atomically. An owned tombstone lets
  // a retry recover even when the first response or storage removal was lost.
  const { data, error } = await client.rpc(cleanupOnly ? 'get_deleted_extension_feedback' : 'delete_actor_extension_feedback', { p_actor: userId, p_id: commentId })
  if (error) throw new Error(error.message)
  if (!data) throw new ExtensionCommentError(404, 'Comment not found')
  if (data.path) {
    const { error: storageError } = await client.storage.from(BUCKET).remove([data.path])
    if (storageError) throw new Error(`Screenshot deletion failed: ${storageError.message}`)
  }
}
