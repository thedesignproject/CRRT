import { useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import { FeedbackWidget } from '../../../src/components/FeedbackWidget'
import type { Comment, PersonalComments, WidgetPage } from '../../../src/components/FeedbackWidget/types'
import { createPageComment, deletePageComment, extensionSession, getExternalWorkDraft, listExtensionProjects, listPageComments, listProjectComments, sendExternalWork, updatePageComment, type ExtensionComment } from '../lib/comments-api'
import { resolveProjectForPage, type ExtensionProjectSelection } from './project-context'

function widgetComment(comment: ExtensionComment): Comment {
  return {
    ...comment,
    projectId: comment.projectId ?? '',
    reviewStatus: comment.reviewStatus ?? 'open',
    imageUrl: comment.screenshotUrl,
    authorName: comment.authorName ?? 'You',
  }
}

export function extensionComments(
  project: ExtensionProjectSelection | null = null,
  visibility: 'shared' | 'internal' = 'shared',
  onVisibilityChange?: (visibility: 'shared' | 'internal') => void,
  scope: 'page' | 'project' = 'page',
  onScopeChange?: (scope: 'page' | 'project') => void,
): PersonalComments {
  const canChooseVisibility = project
    ? project.capabilities?.includes('feedback:manage')
      ?? (project.role !== undefined && project.role !== 'guest')
    : false
  const canSendExternalWork = Boolean(project?.capabilities?.includes('integrations:send'))
  return {
    label: project?.name ?? 'My extension comments',
    audience: project ? {
      value: canChooseVisibility ? visibility : 'shared',
      canChoose: canChooseVisibility,
      onChange: onVisibilityChange,
    } : undefined,
    scope: project && onScopeChange ? { value: scope, onChange: onScopeChange } : undefined,
    externalWork: canSendExternalWork ? {
      providers: ['github', 'linear', 'jira'],
      async prepare(provider, commentId) {
        const prepared = await getExternalWorkDraft(commentId, provider)
        if (!prepared.connected) throw new Error(`Connect ${provider === 'github' ? 'GitHub' : provider === 'linear' ? 'Linear' : 'Jira'} from Project Settings first.`)
        if (prepared.existing) return {
          destination: prepared.destination ?? provider, title: '', body: '', existingUrl: prepared.existing.externalUrl ?? prepared.existing.issueUrl,
        }
        return { destination: prepared.destination ?? provider, ...prepared.draft }
      },
      async send(provider, commentId, draft) {
        const result = await sendExternalWork(commentId, provider, draft)
        const issueUrl = result.externalUrl ?? result.issueUrl
        if (!issueUrl) throw new Error('Tracker did not return an issue URL.')
        return { issueUrl }
      },
    } : undefined,
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
          ? await listProjectComments(project.publicKey, page++)
          : await listPageComments(pageUrl, page++)
        items.push(...result.items.map(widgetComment)); total = result.total
        if (!result.items.length) break
      } while (items.length < total)
      return items
    },
    async create(payload) {
      return widgetComment(await createPageComment({
        ...(project ? { projectId: project.publicKey } : {}),
        ...(project ? { visibility: canChooseVisibility ? visibility : 'shared' } : {}),
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
  const [visibility, setVisibility] = useState<'shared' | 'internal'>('shared')
  const [scope, setScope] = useState<'page' | 'project'>('page')
  useEffect(() => {
    let version = 0, alive = true
    const refresh = async () => {
      const current = ++version
      try {
        const session = await extensionSession()
        const activeProject = session && page?.url
          ? await resolveProjectForPage(page.url, await listExtensionProjects())
          : null
        if (alive && current === version) {
          setIdentity(session?.email ?? null)
          setProject(activeProject)
          setVisibility('shared')
          setScope('page')
        }
      } catch { if (alive && current === version) setIdentity((previous) => previous === undefined ? null : previous) }
    }
    browser.storage.onChanged.addListener(refresh)
    void refresh()
    return () => { alive = false; browser.storage.onChanged.removeListener(refresh) }
  }, [page?.url])
  const comments = useMemo(
    () => extensionComments(project, visibility, setVisibility, scope, setScope),
    [project, scope, visibility],
  )
  const embeddedWidget = Boolean(
    project && page?.embeddedProjectIds?.includes(project.publicKey),
  )
  useEffect(() => {
    if (identity === undefined) return
    if (!embeddedWidget || !project) {
      if (activate) window.dispatchEvent(new CustomEvent('crrt:activate'))
      return
    }
    const focusEmbedded = () => page?.focusEmbedded?.(project.publicKey)
    if (activate) focusEmbedded()
    window.addEventListener('crrt:activate', focusEmbedded)
    return () => window.removeEventListener('crrt:activate', focusEmbedded)
  }, [activate, embeddedWidget, identity, page?.focusEmbedded, project?.publicKey])
  if (identity === undefined) return null
  if (embeddedWidget) return null
  return <><style>{`button, textarea, input { font: inherit }`}</style><FeedbackWidget key={`${identity ?? 'signed-out'}:${project?.publicKey ?? 'private'}`} projectId={project?.publicKey ?? ''} personalComments={comments} viewerEmail={identity ?? undefined} page={page} /></>
}
