import { browser } from 'wxt/browser'
import type { Comment, PersonalComments } from '../../../src/components/FeedbackWidget/types'

export const LOCAL_FEEDBACK_KEY = 'crrt:local-feedback-v1'
export const LOCAL_COMMENT_LIMIT = 50
const STORAGE_BYTES = 8 * 1024 * 1024
export type LocalWorkspace = { version: 1; name: string; comments: Comment[] }
export async function readLocalWorkspace(): Promise<LocalWorkspace> {
  const stored = (await browser.storage.local.get(LOCAL_FEEDBACK_KEY))[LOCAL_FEEDBACK_KEY] as LocalWorkspace | undefined
  return stored ?? { version: 1, name: 'Local feedback', comments: [] }
}
async function mutate<T>(operation: (workspace: LocalWorkspace) => T) {
  // All extension-origin tabs/frames share this Web Lock; storage.local alone has no CAS.
  return navigator.locks.request(LOCAL_FEEDBACK_KEY, async () => {
    const workspace = await readLocalWorkspace()
    const result = operation(workspace)
    if (new TextEncoder().encode(JSON.stringify(workspace)).byteLength > STORAGE_BYTES) {
      throw new Error('Local storage allowance reached. Export or delete feedback to continue.')
    }
    await browser.storage.local.set({ [LOCAL_FEEDBACK_KEY]: workspace })
    return result
  })
}
function normalizePage(pageUrl: string) {
  const url = new URL(pageUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Choose a regular website for local feedback')
  url.hash = ''
  return url.href
}
export async function createLocalComment(payload: Record<string, unknown>): Promise<Comment> {
  if (typeof payload.body !== 'string' || !payload.body.trim() || payload.body.length > 5000
    || typeof payload.selector !== 'string' || !payload.selector || typeof payload.pageUrl !== 'string'
    || typeof payload.x !== 'number' || !Number.isFinite(payload.x)
    || typeof payload.y !== 'number' || !Number.isFinite(payload.y)) throw new Error('Invalid local feedback')
  const pageUrl = normalizePage(payload.pageUrl)
  const imageUrl = payload.imageBase64 ? `data:${payload.imageMimeType};base64,${payload.imageBase64}` : null
  if (imageUrl && (imageUrl.length > 3_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl))) {
    throw new Error('Use a PNG, JPEG or WebP screenshot smaller than 2 MB')
  }
  const comment: Comment = {
    id: crypto.randomUUID(), projectId: 'local', pageUrl, x: payload.x, y: payload.y,
    selector: payload.selector, body: payload.body.trim(), imageUrl, reviewStatus: 'open',
    createdAt: new Date().toISOString(), authorName: 'You', editable: true,
    targetType: payload.targetType as Comment['targetType'], anchor: payload.anchor as Comment['anchor'],
  }
  return mutate(workspace => {
    if (workspace.comments.length >= LOCAL_COMMENT_LIMIT) throw new Error('Local mode stores up to 50 comments. Export or delete feedback, or start a Cloud trial.')
    workspace.comments.push(comment)
    return comment
  })
}
export async function updateLocalComment(id: string, body: string) {
  if (!body.trim() || body.length > 5000) throw new Error('Enter feedback of up to 5000 characters')
  return mutate(workspace => {
    const comment = workspace.comments.find(item => item.id === id)
    if (!comment) throw new Error('Local feedback not found')
    comment.body = body.trim()
  })
}
export async function resolveLocalComment(id: string, resolved: boolean) {
  return mutate(workspace => {
    const comment = workspace.comments.find(item => item.id === id)
    if (!comment) throw new Error('Local feedback not found')
    comment.reviewStatus = resolved ? 'accepted' : 'open'
  })
}
export async function deleteLocalComment(id: string) {
  return mutate(workspace => { workspace.comments = workspace.comments.filter(item => item.id !== id) })
}
export async function exportLocalFeedback() { return JSON.stringify(await readLocalWorkspace(), null, 2) }
export const localComments: PersonalComments = {
  label: 'Local feedback · This browser only',
  async list(pageUrl) { return (await readLocalWorkspace()).comments.filter(item => item.pageUrl === normalizePage(pageUrl)) },
  create: createLocalComment, update: updateLocalComment, remove: deleteLocalComment,
}
