import { useMemo, useState } from 'react'
import { PremiumAgentBridge, type PremiumAgentBridgeServices } from '../../src/components/PremiumAgentBridge'
import { FeedbackWidgetStyles } from '../../src/components/FeedbackWidget/styles'
import type { WidgetAgentComment } from '../../src/components/FeedbackWidget/api'
import type { WidgetLoginSession } from '../../src/lib/widgetLogin'

const PAGE_URL = 'http://localhost:5176/widget-preview'
/* v8 ignore next -- tests intentionally remove the preview's perceptible delay */
const WAIT_MS = import.meta.env.MODE === 'test' ? 0 : 520
const SESSION: WidgetLoginSession = {
  accessToken: `crrt_widget_${'p'.repeat(43)}`,
  displayName: 'Local preview',
  expiresAt: '2099-01-01T00:00:00.000Z',
}
const COMMENTS: WidgetAgentComment[] = [
  { id: 'preview-1', pageUrl: PAGE_URL, selector: '#hero h1', body: 'Make the product promise clearer in the headline.', reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null, createdAt: '2026-10-13T12:00:00.000Z', authorName: 'Mina' },
  { id: 'preview-2', pageUrl: PAGE_URL, selector: '#hero-cta', body: 'Keep the primary action visible when the title wraps.', reviewStatus: 'accepted', implementationStatus: 'unassigned', claimedByAgentId: null, createdAt: '2026-10-13T12:04:00.000Z', authorName: 'Tomas' },
  { id: 'preview-3', pageUrl: PAGE_URL, selector: 'nav[aria-label="Primary"]', body: 'Verify the navigation spacing before release.', reviewStatus: 'accepted', implementationStatus: 'in_progress', claimedByAgentId: 'agent-preview', createdAt: '2026-10-13T12:08:00.000Z', authorName: 'Pranav' },
]

const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, WAIT_MS))

export function createPreviewServices(): PremiumAgentBridgeServices {
  const failedOnce = new Set<string>()
  return {
    fetchEligibility: async () => { await wait(); return { state: 'ready', comments: COMMENTS } },
    createSession: async (_apiBase, input) => {
      await wait()
      return { shareId: 'preview-share', slug: 'preview', token: 'preview-token', tokenUrl: '#', expiresAt: SESSION.expiresAt, commentCount: input.commentIds.length }
    },
    startUpgrade: async () => ({ url: '#' }),
    fetchExternalDraft: async (_apiBase, commentId, provider) => {
      await wait()
      return { provider, connected: true, destination: 'CRRT Preview', existing: null, draft: { title: COMMENTS.find((comment) => comment.id === commentId)!.body, body: `Visual context for ${commentId}` } }
    },
    createExternal: async (_apiBase, commentId, provider) => {
      await wait()
      if (commentId === 'preview-2' && !failedOnce.has(commentId)) {
        failedOnce.add(commentId)
        throw new Error(`Preview failure for ${provider}. Retry to complete it.`)
      }
      return { externalUrl: `https://example.com/${provider}/${commentId}`, created: true }
    },
    loadPrompts: async () => {
      await wait()
      return {
        'claude-code': 'Implement the selected CRRT feedback with the attached visual context.',
        codex: 'Implement the selected CRRT feedback and preserve the project design rules.',
        generic: 'Apply the selected visual feedback, then return the change for review.',
      }
    },
  }
}

export function WidgetPreview() {
  const [open, setOpen] = useState(true)
  const [version, setVersion] = useState(0)
  const services = useMemo(createPreviewServices, [version])

  function reset() {
    setVersion((current) => current + 1)
    setOpen(true)
  }

  return (
    <main data-fw-crrt="" data-crrt-theme="dark" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32, color: '#24211f', background: '#f7f5f2', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <FeedbackWidgetStyles />
      <section style={{ maxWidth: 620, textAlign: 'center' }}>
        <p style={{ margin: '0 0 10px', color: '#c15a26', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>Local widget preview</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(40px, 7vw, 76px)', lineHeight: .95, letterSpacing: '-.055em' }}>Test the real Agent Bridge.</h1>
        <p style={{ margin: '24px auto', maxWidth: 520, color: '#6b6763', fontSize: 17, lineHeight: 1.55 }}>Fixture comments and tracker responses stay inside this browser. No CRRT project or account is required.</p>
        <button type="button" onClick={reset} style={{ minHeight: 46, padding: '0 20px', border: 0, borderRadius: 999, color: '#fff', background: '#c15a26', font: '700 14px/1 inherit', cursor: 'pointer' }}>{open ? 'Reset preview' : 'Open widget preview'}</button>
      </section>
      {open && <PremiumAgentBridge key={version} apiBase="preview://crrt" projectId="preview-project" pageUrl={PAGE_URL} widgetSession={SESSION} onLogin={async () => undefined} onClose={() => setOpen(false)} services={services} />}
    </main>
  )
}
