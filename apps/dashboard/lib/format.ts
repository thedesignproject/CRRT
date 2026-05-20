import type { ShareEventsResponse } from '../api'

type FeedbackEvent = ShareEventsResponse['events'][number]

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function truncateUrl(url: string) {
  return url.startsWith('/') ? url : url.replace(/^https?:\/\/[^/]+/, '')
}

export function formatDocUrl(url: string) {
  try {
    const u = new URL(url)
    const slug = u.searchParams.get('fw_share') ?? ''
    const token = u.searchParams.get('token') ?? ''
    const tokenShort = token.length > 8 ? `${token.slice(0, 6)}…${token.slice(-3)}` : token
    return `${u.host}/?fw_share=${slug}&token=${tokenShort}`
  } catch {
    return url
  }
}

export function describeEvent(ev: FeedbackEvent): { kind: 'done' | 'claim' | 'file' | 'other'; text: string } {
  const actor = ev.actorId || 'agent'
  const summary = typeof ev.payload?.summary === 'string' ? ev.payload.summary as string : null
  const note = typeof ev.payload?.note === 'string' ? ev.payload.note as string : null
  switch (ev.eventType) {
    case 'comment.claimed':
      return { kind: 'claim', text: `${actor} claimed comment` }
    case 'comment.started':
      return { kind: 'file', text: `${actor} started${summary ? ` · ${summary}` : ''}` }
    case 'comment.noted':
      return { kind: 'other', text: `${actor} note${note ? ` · ${note}` : ''}` }
    case 'comment.blocked':
      return { kind: 'other', text: `${actor} blocked${note ? ` · ${note}` : ''}` }
    case 'comment.completed':
      return { kind: 'done', text: `${actor} done${summary ? ` · ${summary}` : ''}` }
    case 'comment.reopened':
      return { kind: 'other', text: `${actor} reopened comment` }
    case 'comment.reviewed':
      return { kind: 'other', text: `Reviewer marked ${ev.payload?.reviewStatus ?? 'updated'}` }
    case 'comment.implementation_changed':
      return { kind: 'other', text: `Status → ${ev.payload?.implementationStatus ?? 'updated'}` }
    case 'presence.updated':
      return { kind: 'other', text: `${actor} ${typeof ev.payload?.status === 'string' ? ev.payload.status as string : 'present'}${summary ? ` · ${summary}` : ''}` }
    case 'share.created':
      return { kind: 'other', text: `Session opened` }
    default:
      return { kind: 'other', text: ev.eventType }
  }
}

export function buildIntegrationPrompt(projectId: string, apiBase: string) {
  return `Install the Design Project feedback widget so reviewers can leave visual feedback in this app.

1. Install the package:

   npm install @thedesignproject/crrt

2. Mount <FeedbackWidget /> in the root React component (e.g. App.tsx or a top-level layout) so it appears on every page:

   import { FeedbackWidget } from '@thedesignproject/crrt'

   export default function App() {
     return (
       <>
         {/* existing app */}
         <FeedbackWidget
           apiBase="${apiBase}"
           projectId="${projectId}"
         />
       </>
     )
   }

The widget injects a floating pin tool. Reviewers click anywhere on the page to drop a pin and attach a comment + screenshot, which appear in this dashboard.

Use these exact config values:
- apiBase:   ${apiBase}
- projectId: ${projectId}

Follow the codebase's existing conventions (TypeScript, formatter, project structure). Don't refactor unrelated code.`
}
