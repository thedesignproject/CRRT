import { useState } from 'react'
import { FeedbackWidget } from '../../../src/components/FeedbackWidget'
import type { Comment, PersonalComments } from '../../../src/components/FeedbackWidget/types'
import { comments, fixedTime } from '../fixtures/data'
const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'idle'
const theme = params.get('theme') === 'light' ? 'light' : 'dark'
export function WidgetHarness() {
  const [items, setItems] = useState<Comment[]>(state.includes('empty') ? [] : comments.map(c => ({ ...c, reviewStatus: c.reviewStatus as Comment['reviewStatus'], pageUrl: location.href })))
  const adapter: PersonalComments = {
    label: 'Visual feedback',
    audience: { value: 'shared', canChoose: state !== 'guest', onChange() {} },
    scope: { value: 'page', onChange() {} },
    async list() { if (state === 'load-error') throw new Error('Could not load feedback'); return items },
    async create(payload) {
      if (state === 'sending') return new Promise<never>(() => {})
      if (state === 'send-error') throw new Error('Could not send feedback. Try again.')
      const next = { ...comments[0], ...payload, id: 'created', pageUrl: location.href, createdAt: fixedTime } as Comment
      setItems([...items, next]); return next
    },
    async update(id, body) { setItems(items.map(c => c.id === id ? { ...c, body } : c)) },
    async remove(id) { setItems(items.filter(c => c.id !== id)) },
    externalWork: { providers: ['github', 'linear', 'jira'], async prepare() { return { destination: 'acme/product', title: 'Improve heading readability', body: 'Review the heading on the pricing page.' } }, async send() { if (state === 'tracker-error') throw new Error('Tracker is unavailable'); if (state === 'tracker-sending') return new Promise<never>(() => {}); return { issueUrl: 'https://example.test/issues/1' } } },
  }
  return <>
    <main style={{ padding: 40, maxWidth: 800, fontFamily: 'Figtree Variable, sans-serif' }}>
      <h1 id="target-heading">A page worth reviewing</h1>
      <p id="target-copy">Select an element or quote this sentence to leave precise visual feedback.</p>
      <button id="target-button" style={{ padding: '12px 24px', marginTop: 36 }}>Review this action</button>
      <div style={{ marginTop: 80, height: 180, overflow: 'auto', border: '1px solid #888', padding: 16 }}><div style={{ height: 500 }}><h2>Nested scroll area</h2><p>Feedback stays attached to its target.</p></div></div>
      <div style={{ height: 600 }} /><button id="edge-target">An action near the page edge</button>
    </main>
    <FeedbackWidget projectId="visual-project" apiBase="/api" theme={theme} disabled={state === 'disabled'} personalComments={params.get('public') ? undefined : adapter} />
  </>
}
