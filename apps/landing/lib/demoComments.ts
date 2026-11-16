import type { Comment, PersonalComments } from '../../../src/components/FeedbackWidget/types'

const STORAGE_KEY = 'crrt:landing-demo-comments:v1'

export interface DemoComments extends PersonalComments {
  review: NonNullable<PersonalComments['review']>
  subscribe: NonNullable<PersonalComments['subscribe']>
  getSnapshot(): Comment[]
  reset(): void
}

/** The real widget, backed by this tab rather than a public project or API. */
export function createDemoComments(): DemoComments {
  let comments: Comment[] = []
  const listeners = new Set<() => void>()
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) comments = saved.filter((item): item is Comment =>
      item && typeof item.id === 'string' && typeof item.pageUrl === 'string'
      && typeof item.body === 'string' && typeof item.selector === 'string'
      && typeof item.x === 'number' && typeof item.y === 'number')
  } catch { /* Storage can be unavailable; the live demo still works in memory. */ }

  function save() {
    listeners.forEach(listener => listener())
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(comments)) } catch {
      // Screenshot data can exceed storage quota. Keep text/pins across reloads.
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(comments.map((comment) => ({ ...comment, imageUrl: null })))) } catch { /* Memory-only fallback. */ }
    }
  }

  return {
    label: 'Your demo feedback',
    getSnapshot: () => comments,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async review(id, reviewStatus) { comments = comments.map(comment => comment.id === id ? { ...comment, reviewStatus } : comment); save() },
    reset() { comments = []; save() },
    async list(pageUrl) { return comments.filter((comment) => comment.pageUrl === pageUrl) },
    async create(payload) {
      const comment: Comment = {
        id: crypto.randomUUID(), projectId: 'crrt-landing-demo',
        pageUrl: String(payload.pageUrl), selector: String(payload.selector),
        x: Number(payload.x), y: Number(payload.y), body: String(payload.body),
        authorName: 'You', reviewStatus: 'open', createdAt: new Date().toISOString(),
        targetType: payload.targetType as Comment['targetType'],
        anchor: payload.anchor as Comment['anchor'],
        imageUrl: payload.imageBase64 ? `data:${payload.imageMimeType};base64,${payload.imageBase64}` : null,
      }
      comments = [comment, ...comments].slice(0, 30)
      save()
      return comment
    },
    async update(id, body) { comments = comments.map((comment) => comment.id === id ? { ...comment, body } : comment); save() },
    async remove(id) { comments = comments.filter((comment) => comment.id !== id); save() },
  }
}
