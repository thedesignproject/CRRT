import { useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import { FeedbackWidget } from '../../../src/components/FeedbackWidget'
import type { Comment, PersonalComments, WidgetPage } from '../../../src/components/FeedbackWidget/types'
import { createPageComment, deletePageComment, extensionSession, listPageComments, updatePageComment, type ExtensionComment } from '../lib/comments-api'
import { getActiveProject, type ExtensionProjectSelection } from './project-context'

function widgetComment(comment: ExtensionComment): Comment {
  return { ...comment, projectId: comment.projectId ?? '', reviewStatus: 'open', imageUrl: comment.screenshotUrl, authorName: comment.authorName ?? 'You' }
}

export function extensionComments(project: ExtensionProjectSelection | null = null): PersonalComments {
  return {
    label: project?.name ?? 'My extension comments',
    async beforeOpen() {
      if (await extensionSession()) return true
      const response = await browser.runtime.sendMessage({ type: 'auth:open-popup' })
      if (!response?.ok) throw new Error('Could not open sign-in. Click CRRT in Chrome’s toolbar to sign in.')
      return false
    },
    async list(pageUrl) {
      if (!await extensionSession()) return []
      const items: Comment[] = []
      let page = 1
      let total: number
      do {
        const result = project
          ? await listPageComments(pageUrl, page++, project.publicKey)
          : await listPageComments(pageUrl, page++)
        items.push(...result.items.map(widgetComment)); total = result.total
        if (!result.items.length) break
      } while (items.length < total)
      return items
    },
    async create(payload) {
      return widgetComment(await createPageComment({
        ...(project ? { projectId: project.publicKey } : {}),
        pageUrl: payload.pageUrl as string, selector: payload.selector as string,
        x: payload.x as number, y: payload.y as number, body: payload.body as string,
        targetType: payload.targetType as Comment['targetType'], anchor: payload.anchor as Comment['anchor'],
        screenshot: payload.imageBase64 ? { base64: payload.imageBase64 as string, mimeType: payload.imageMimeType as string } : null,
      }))
    },
    update: updatePageComment,
    remove: deletePageComment,
  }
}

export const personalComments = extensionComments()

export function ExtensionWidget({ activate, page }: { activate: boolean; page?: WidgetPage }) {
  const [identity, setIdentity] = useState<string | null | undefined>(undefined)
  const [project, setProject] = useState<ExtensionProjectSelection | null>(null)
  useEffect(() => {
    let version = 0, alive = true
    const refresh = async () => {
      const current = ++version
      try {
        const [session, activeProject] = await Promise.all([extensionSession(), getActiveProject()])
        if (alive && current === version) {
          setIdentity(session?.email ?? null)
          setProject(activeProject)
        }
      } catch { if (alive && current === version) setIdentity((previous) => previous === undefined ? null : previous) }
    }
    browser.storage.onChanged.addListener(refresh)
    void refresh()
    return () => { alive = false; browser.storage.onChanged.removeListener(refresh) }
  }, [])
  const comments = useMemo(() => extensionComments(project), [project?.publicKey, project?.name])
  useEffect(() => {
    if (identity !== undefined && activate) window.dispatchEvent(new CustomEvent('crrt:activate'))
  }, [identity, activate])
  if (identity === undefined) return null
  return <><style>{`button, textarea, input { font: inherit }`}</style><FeedbackWidget key={`${identity ?? 'signed-out'}:${project?.publicKey ?? 'private'}`} projectId={project?.publicKey ?? ''} personalComments={comments} viewerEmail={identity ?? undefined} page={page} /></>
}
