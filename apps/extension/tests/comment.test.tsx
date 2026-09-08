import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const storage = vi.hoisted(() => ({ addListener: vi.fn(), removeListener: vi.fn() }))
const sendMessage = vi.hoisted(() => vi.fn())
vi.mock('wxt/browser', () => ({ browser: { storage: { onChanged: storage }, runtime: { sendMessage, getURL: (path: string) => `chrome-extension://test${path}` } } }))
vi.mock('../lib/page-host', () => ({ connectPageHost: vi.fn(() => vi.fn()) }))
vi.mock('wxt', () => ({ defineConfig: (config: unknown) => config }))
vi.mock('wxt/utils/define-unlisted-script', () => ({ defineUnlistedScript: (main: unknown) => main }))
vi.mock('../lib/comments-api', () => ({ extensionSession: vi.fn(), createPageComment: vi.fn(), deletePageComment: vi.fn(), getExternalWorkDraft: vi.fn(), listExtensionProjects: vi.fn(), listPageComments: vi.fn(), listProjectComments: vi.fn(), sendExternalWork: vi.fn(), updatePageComment: vi.fn() }))
const resolveProjectForPage = vi.hoisted(() => vi.fn())
vi.mock('../lib/project-context', () => ({ resolveProjectForPage }))
vi.mock('../../../src/lib/screenshotCapture', () => ({
  useScreenshotCapture: () => {
    const [image, setImage] = useState<Blob | null>(null)
    return { image, previewUrl: image ? 'blob:preview' : null, status: image ? 'ready' : 'idle',
      capture: () => setImage(new Blob(['image'])), clear: () => setImage(null),
      toBase64: async () => image ? { base64: 'eA==', mimeType: 'image/png' } : null }
  },
}))

import script, { mountWidget } from '../entrypoints/comment'
import { ExtensionWidget, extensionComments, personalComments } from '../lib/personal-widget'
import autoload from '../entrypoints/autoload.content'
import config from '../wxt.config'
import { createPageComment, deletePageComment, extensionSession, getExternalWorkDraft, listExtensionProjects, listPageComments, listProjectComments, sendExternalWork, updatePageComment, type ExtensionComment } from '../lib/comments-api'
import type { WidgetPage } from '../../../src/components/FeedbackWidget/types'
import { FeedbackWidget } from '../../../src/components/FeedbackWidget'

const comment: ExtensionComment = { id: 'c1', projectId: null, pageUrl: location.href.split('#')[0], pageHostname: 'localhost', x: 10, y: 20, selector: '#target', body: 'First', screenshotUrl: 'https://signed/one', authorName: 'user@example.com', createdAt: '2026-09-03', updatedAt: '2026-09-03' }
let target: HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  sendMessage.mockResolvedValue({ ok: true })
  vi.mocked(extensionSession).mockResolvedValue({ email: 'user@example.com', accessToken: 'token' })
  vi.mocked(listExtensionProjects).mockResolvedValue([])
  resolveProjectForPage.mockReset().mockResolvedValue(null)
  vi.mocked(listPageComments).mockResolvedValue({ items: [comment], total: 1 })
  vi.mocked(listProjectComments).mockResolvedValue({ items: [{ ...comment, projectId: 'project' }], total: 1 })
  vi.mocked(createPageComment).mockResolvedValue({ ...comment, id: 'new', body: 'New' })
  vi.mocked(getExternalWorkDraft).mockResolvedValue({ provider: 'github', connected: true, destination: 'acme/store', existing: null, draft: { title: 'Feedback title', body: 'Feedback body' } })
  vi.mocked(sendExternalWork).mockResolvedValue({ issueNumber: 1, issueUrl: 'https://github.com/acme/store/issues/1', createdAt: 'now', created: true })
  vi.mocked(updatePageComment).mockResolvedValue(comment); vi.mocked(deletePageComment).mockResolvedValue()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Public widget endpoints must not be used'))
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 40 } as DOMRect)
  target = document.createElement('article'); target.id = 'target'; target.textContent = 'Page target'; document.body.append(target)
})
afterEach(() => { cleanup(); target.remove(); document.querySelector('[data-crrt-extension]')?.remove(); vi.restoreAllMocks(); vi.useRealTimers() })

function setup(activate = false, page?: WidgetPage) {
  const host = document.createElement('div'); host.dataset.crrtExtension = 'true'; host.dataset.fw = ''; document.body.append(host)
  const shadow = host.attachShadow({ mode: 'closed' })
  const container = document.createElement('div'); shadow.append(container)
  const view = render(<ExtensionWidget activate={activate} page={page} />, { container })
  return { ...view, host, shadow, ui: within(container) }
}

async function selectTarget(view: ReturnType<typeof setup>) {
  fireEvent.click(view.ui.getByRole('button', { name: 'Open CRRT menu' }))
  const drop = await view.ui.findByRole('menuitem', { name: /Drop comment/ })
  fireEvent.pointerDown(drop, { bubbles: true, composed: true })
  expect(view.ui.getByRole('menuitem', { name: /Drop comment/ })).toBe(drop)
  fireEvent.click(drop)
  fireEvent.mouseMove(target)
  expect(target.style.outlineWidth).toBe('2px')
  fireEvent.mouseMove(view.host); expect(target.style.outline).toBe('')
  fireEvent.mouseMove(target)
  fireEvent.click(target, { clientX: 30, clientY: 40 })
  return view.ui.findByPlaceholderText('Leave your comment…')
}

it('mounts the actual idle widget, highlights selection, and sends through the private adapter', async () => {
  const view = setup()
  await waitFor(() => expect(listPageComments).toHaveBeenCalledWith(location.href.split('#')[0], 1))
  expect(view.ui.getByRole('button', { name: 'Open CRRT menu' }).parentElement?.parentElement).toHaveStyle({ right: '24px', top: '50%' })
  fireEvent.click(target); expect(view.ui.queryByPlaceholderText('Leave your comment…')).toBeNull()
  const textarea = await selectTarget(view)
  const avatar = view.ui.getByTitle('Signed in as user@example.com')
  expect(avatar).toHaveTextContent('U')
  expect(avatar.style.background).toBe('var(--fw-surface-raised)')
  expect(avatar.style.color).toBe('var(--fw-foreground)')
  expect(target.style.outline).toBe('')
  fireEvent.keyDown(textarea, { key: 'f', bubbles: true, composed: true })
  expect(view.ui.getByRole('button', { name: 'Open CRRT menu' }).parentElement?.parentElement).toHaveStyle({ opacity: '1' })
  expect(view.ui.queryByRole('button', { name: 'Close sidebar' })).toBeNull()
  fireEvent.change(textarea, { target: { value: 'New' } })
  fireEvent.click(view.container.querySelector('button[title]')!) // personal identity never opens the name editor
  fireEvent.click(view.ui.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(createPageComment).toHaveBeenCalledWith(expect.objectContaining({ body: 'New', screenshot: { base64: 'eA==', mimeType: 'image/png' } })))
  expect(globalThis.fetch).not.toHaveBeenCalled()
  expect(sendMessage).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: 'A', shiftKey: true })
  expect(view.ui.queryByText('Open agent')).toBeNull()
})

it('uses the selected project for authenticated extension comments', async () => {
  vi.mocked(listProjectComments).mockResolvedValue({ items: [{ ...comment, projectId: 'project' }], total: 1 })
  const changeAudience = vi.fn()
  const adapter = extensionComments({
    publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['feedback:manage'],
  }, 'internal', changeAudience)
  expect(adapter.label).toBe('Storefront')
  expect(adapter.audience).toEqual({ value: 'internal', canChoose: true, onChange: changeAudience })
  expect(personalComments.audience).toBeUndefined()
  expect(extensionComments({ publicKey: 'legacy', name: 'Legacy member', role: 'member' }).audience)
    .toMatchObject({ canChoose: true })
  expect(extensionComments({ publicKey: 'legacy', name: 'Legacy guest', role: 'guest' }).audience)
    .toMatchObject({ canChoose: false })
  expect(extensionComments({ publicKey: 'legacy', name: 'Legacy project' }).audience)
    .toMatchObject({ canChoose: false })
  await expect(adapter.list(location.href.split('#')[0])).resolves.toHaveLength(1)
  expect(listProjectComments).toHaveBeenCalledWith('project', 1)
  await adapter.create({
    projectId: 'project', pageUrl: location.href.split('#')[0], selector: '#target', x: 1, y: 2,
    body: 'Project feedback', targetType: 'element_point', anchor: null,
  })
  expect(createPageComment).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 'project', body: 'Project feedback', visibility: 'internal',
  }))
  expect(adapter.externalWork).toBeUndefined()

  const tracker = extensionComments({
    publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['integrations:send'],
  })
  vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'github', connected: false, destination: null, existing: null, draft: { title: 'T', body: 'B' } })
  await expect(tracker.externalWork?.prepare('c1')).rejects.toThrow('Connect GitHub')
  const existing = { issueNumber: 1, issueUrl: 'https://github.com/acme/store/issues/1', createdAt: 'now' }
  vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'github', connected: true, destination: null, existing, draft: { title: 'Ignored', body: 'Ignored' } })
  await expect(tracker.externalWork?.prepare('c1')).resolves.toEqual({
    destination: 'GitHub', title: '', body: '', existingUrl: existing.issueUrl,
  })
  vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'github', connected: true, destination: null, existing: null, draft: { title: 'T', body: 'B' } })
  await expect(tracker.externalWork?.prepare('c1')).resolves.toEqual({ destination: 'GitHub', title: 'T', body: 'B' })
  await expect(tracker.externalWork?.send('c1', { title: 'T', body: 'B' })).resolves.toEqual({ issueUrl: existing.issueUrl })

  const guest = extensionComments({
    publicKey: 'project', name: 'Storefront', role: 'guest', capabilities: ['feedback:read', 'feedback:create'],
  }, 'internal', changeAudience)
  expect(guest.audience).toMatchObject({ value: 'shared', canChoose: false })
  await guest.create({
    pageUrl: location.href, selector: '#target', x: 1, y: 2, body: 'Guest feedback',
  })
  expect(createPageComment).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'shared' }))
})

it('renders selectable member and locked guest audiences in the composer', async () => {
  const changeAudience = vi.fn()
  const member = extensionComments({
    publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['feedback:manage'],
  }, 'internal', changeAudience)
  let view = render(<FeedbackWidget projectId="project" personalComments={member} viewerEmail="user@example.com" />)
  await waitFor(() => expect(listProjectComments).toHaveBeenCalled())
  fireEvent.keyDown(window, { key: 'c' })
  fireEvent.mouseMove(target)
  fireEvent.click(target, { clientX: 30, clientY: 40 })
  const memberComposer = await view.findByPlaceholderText('Leave your comment…')
  const audience = view.getByRole('combobox', { name: 'Feedback audience' })
  expect(audience).toHaveValue('internal')
  fireEvent.change(audience, { target: { value: 'shared' } })
  expect(changeAudience).toHaveBeenCalledWith('shared')
  fireEvent.change(memberComposer, { target: { value: 'Internal note' } })
  fireEvent.click(view.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(createPageComment).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'internal' })))
  view.unmount()

  const guest = extensionComments({
    publicKey: 'project', name: 'Storefront', role: 'guest', capabilities: ['feedback:read', 'feedback:create'],
  })
  view = render(<FeedbackWidget projectId="project" personalComments={guest} viewerEmail="guest@example.com" />)
  await waitFor(() => expect(listProjectComments).toHaveBeenCalled())
  fireEvent.keyDown(window, { key: 'c' })
  fireEvent.mouseMove(target)
  fireEvent.click(target, { clientX: 30, clientY: 40 })
  await view.findByPlaceholderText('Leave your comment…')
  expect(view.queryByRole('combobox', { name: 'Feedback audience' })).toBeNull()
  expect(view.getByText('Shared')).toBeInTheDocument()
})

it('keeps the default personal sidebar label for adapters without a custom label', async () => {
  const view = render(<FeedbackWidget
    projectId=""
    personalComments={{ ...personalComments, label: undefined }}
    viewerEmail="user@example.com"
  />)
  await waitFor(() => expect(listPageComments).toHaveBeenCalled())
  fireEvent.keyDown(window, { key: 'f' })
  expect(view.getByText('My extension comments')).toBeInTheDocument()
})

it('uses a safe author fallback for extension comments without an author name', async () => {
  vi.mocked(listPageComments).mockResolvedValue({ items: [{ ...comment, authorName: null }], total: 1 })
  await expect(personalComments.list(location.href.split('#')[0])).resolves.toEqual([
    expect.objectContaining({ authorName: 'You', projectId: '' }),
  ])
})

it('shows current-page pins and project-wide feedback without making other authors editable', async () => {
  const project = { publicKey: 'project', name: 'Storefront', role: 'guest' as const, capabilities: ['feedback:read', 'feedback:create'] }
  resolveProjectForPage.mockResolvedValue(project)
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  vi.mocked(listProjectComments).mockResolvedValue({
    items: [
      { ...comment, projectId: 'project', pageUrl: `${location.origin}${location.pathname}?utm_source=test`, editable: true },
      { ...comment, id: 'other', projectId: 'project', pageUrl: 'https://site.test/checkout', body: 'Checkout feedback', authorName: null, reviewStatus: 'accepted', editable: false },
      { ...comment, id: 'root', projectId: 'project', pageUrl: 'https://else.test/', body: 'Homepage feedback', editable: false },
      { ...comment, id: 'about', projectId: 'project', pageUrl: 'about:', body: 'Protocol feedback', editable: false },
      { ...comment, id: 'legacy', projectId: 'project', pageUrl: 'legacy-url', body: 'Legacy feedback', editable: false },
    ],
    total: 5,
  })
  const page: WidgetPage = {
    url: `${location.origin}${location.pathname}`,
    width: 1000, height: 1000, scrollX: 0, scrollY: 0, liveIds: ['c1'],
    capture: vi.fn(), selecting: vi.fn(), track: vi.fn(), highlight: vi.fn(),
  }
  const view = setup(false, page)
  await waitFor(() => expect(view.container.querySelectorAll('[data-fw-pin]')).toHaveLength(1))
  fireEvent.keyDown(window, { key: 'f' })
  await view.ui.findByRole('button', { name: /This page/ })
  expect(view.ui.queryByText('Checkout feedback')).toBeNull()
  fireEvent.click(view.ui.getByRole('button', { name: /All feedback/ }))
  expect(await view.ui.findByText('Checkout feedback')).toBeInTheDocument()
  expect(view.ui.getByText('Homepage feedback')).toBeInTheDocument()
  expect(view.ui.getByText('Protocol feedback')).toBeInTheDocument()
  expect(view.ui.getByText('Legacy feedback')).toBeInTheDocument()
  expect(view.ui.getByText('You')).toBeInTheDocument()
  expect(view.ui.getAllByText('/')).toHaveLength(2)
  expect(view.ui.getByText('legacy-url')).toBeInTheDocument()
  fireEvent.click(view.ui.getByText('Checkout feedback'))
  expect(open).toHaveBeenCalledWith('https://site.test/checkout', '_blank', 'noopener,noreferrer')
  expect(view.container.querySelectorAll('[data-fw-pin]')).toHaveLength(1)
  expect(view.ui.getAllByRole('button', { name: 'More' })).toHaveLength(1)
})

it('refreshes an open personal sidebar and ignores offline or late interval results', async () => {
  vi.useFakeTimers()
  const list = vi.fn().mockResolvedValue([comment])
  const adapter = { ...personalComments, list }
  const view = render(<FeedbackWidget projectId="" personalComments={adapter} viewerEmail="user@example.com" />)
  await act(async () => {})
  fireEvent.keyDown(window, { key: 'f' })

  list.mockResolvedValueOnce([{ ...comment, body: 'Fresh interval feedback' }])
  await act(async () => { vi.advanceTimersByTime(15_000) })
  expect(view.getByText('Fresh interval feedback')).toBeInTheDocument()

  list.mockRejectedValueOnce(new Error('offline'))
  await act(async () => { vi.advanceTimersByTime(15_000) })
  expect(view.getByText('Fresh interval feedback')).toBeInTheDocument()

  let resolve!: (comments: ExtensionComment[]) => void
  list.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  await act(async () => { vi.advanceTimersByTime(15_000) })
  view.unmount()
  await act(async () => { resolve([{ ...comment, body: 'Late interval feedback' }]) })
})

it('lets internal members edit and confirm a manual GitHub handoff from the extension', async () => {
  resolveProjectForPage.mockResolvedValue({ publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['feedback:read', 'feedback:create', 'integrations:send'] })
  const page: WidgetPage = { url: location.href.split('#')[0], width: 1000, height: 1000, scrollX: 0, scrollY: 0, liveIds: ['c1'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(), highlight: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const view = setup(false, page)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.click(view.container.querySelector('[data-fw-pin]')!)
  fireEvent.click(view.ui.getByRole('button', { name: 'More options' }))
  fireEvent.click(view.ui.getByRole('button', { name: 'Send to…' }))
  const title = await view.ui.findByRole('textbox', { name: 'External work title' })
  fireEvent.change(title, { target: { value: 'Edited title' } })
  fireEvent.change(view.ui.getByRole('textbox', { name: 'External work description' }), { target: { value: 'Edited body' } })
  fireEvent.click(view.ui.getByRole('button', { name: 'Create issue' }))
  await waitFor(() => expect(sendExternalWork).toHaveBeenCalledWith('c1', { title: 'Edited title', body: 'Edited body' }))
  expect(open).toHaveBeenCalledWith('https://github.com/acme/store/issues/1', '_blank', 'noopener,noreferrer')
})

it('opens an existing handoff safely and hides handoff actions for rejected feedback', async () => {
  resolveProjectForPage.mockResolvedValue({ publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['integrations:send'] })
  const page: WidgetPage = { url: location.href.split('#')[0], width: 1000, height: 1000, scrollX: 0, scrollY: 0, liveIds: ['c1'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(), highlight: vi.fn() }
  const existing = { issueNumber: 1, issueUrl: 'https://github.com/acme/store/issues/1', createdAt: 'now' }
  vi.mocked(getExternalWorkDraft).mockResolvedValueOnce({ provider: 'github', connected: true, destination: 'acme/store', existing, draft: { title: '', body: '' } })
  const opened = { opener: 'parent' }
  const open = vi.spyOn(window, 'open').mockReturnValue(opened as never)
  const view = setup(false, page)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'f' })
  fireEvent.click(await view.ui.findByRole('button', { name: 'More' }))
  const send = view.ui.getByRole('button', { name: 'Send to…' })
  fireEvent.mouseEnter(send)
  fireEvent.mouseLeave(send)
  fireEvent.click(send)
  await waitFor(() => expect(open).toHaveBeenCalledWith(existing.issueUrl, '_blank', 'noopener,noreferrer'))
  expect(opened.opener).toBeNull()
  expect(view.ui.queryByRole('dialog')).toBeNull()
  view.unmount()

  vi.mocked(listProjectComments).mockResolvedValueOnce({
    items: [{ ...comment, projectId: 'project', reviewStatus: 'rejected', editable: true }], total: 1,
  })
  const rejected = setup(false, page)
  await waitFor(() => expect(rejected.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'f' })
  fireEvent.click(await rejected.ui.findByRole('button', { name: 'More' }))
  expect(rejected.ui.queryByRole('button', { name: 'Send to…' })).toBeNull()
})

it('keeps the handoff dialog recoverable across preparation and send failures', async () => {
  resolveProjectForPage.mockResolvedValue({ publicKey: 'project', name: 'Storefront', role: 'member', capabilities: ['integrations:send'] })
  const page: WidgetPage = { url: location.href.split('#')[0], width: 1000, height: 1000, scrollX: 0, scrollY: 0, liveIds: ['c1'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(), highlight: vi.fn() }
  vi.mocked(sendExternalWork)
    .mockRejectedValueOnce(new Error('Safe send error'))
    .mockRejectedValueOnce('opaque failure')
  const view = setup(false, page)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'f' })

  const openDialog = async () => {
    fireEvent.click(await view.ui.findByRole('button', { name: 'More' }))
    fireEvent.click(view.ui.getByRole('button', { name: 'Send to…' }))
    return view.ui.findByRole('dialog')
  }
  let dialog = await openDialog()
  fireEvent.mouseDown(dialog)
  expect(view.ui.getByRole('dialog')).toBeInTheDocument()
  fireEvent.mouseDown(dialog.parentElement!)
  expect(view.ui.queryByRole('dialog')).toBeNull()

  dialog = await openDialog()
  fireEvent.click(view.ui.getByRole('button', { name: 'Cancel' }))
  expect(view.ui.queryByRole('dialog')).toBeNull()
  dialog = await openDialog()
  const title = view.ui.getByRole('textbox', { name: 'External work title' })
  const body = view.ui.getByRole('textbox', { name: 'External work description' })
  fireEvent.change(title, { target: { value: ' ' } })
  expect(view.ui.getByRole('button', { name: 'Create issue' })).toBeDisabled()
  fireEvent.change(title, { target: { value: 'Title' } })
  fireEvent.change(body, { target: { value: ' ' } })
  expect(view.ui.getByRole('button', { name: 'Create issue' })).toBeDisabled()
  fireEvent.change(body, { target: { value: 'Body' } })
  fireEvent.click(view.ui.getByRole('button', { name: 'Create issue' }))
  expect(await view.ui.findByRole('alert')).toHaveTextContent('Safe send error')

  fireEvent.click(view.ui.getByRole('button', { name: 'Create issue' }))
  expect(await view.ui.findByRole('alert')).toHaveTextContent('Could not create external work')

  let resolveSend!: (value: { issueNumber: number; issueUrl: string; createdAt: string; created: boolean }) => void
  vi.mocked(sendExternalWork).mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve }))
  const create = view.ui.getByRole('button', { name: 'Create issue' })
  act(() => { create.click(); create.click() })
  expect(sendExternalWork).toHaveBeenCalledTimes(3)
  expect(view.ui.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  fireEvent.mouseDown(view.ui.getByRole('dialog').parentElement!)
  expect(view.ui.getByRole('dialog')).toBeInTheDocument()
  const opened = { opener: 'parent' }
  vi.spyOn(window, 'open').mockReturnValue(opened as never)
  await act(async () => resolveSend({ issueNumber: 2, issueUrl: 'https://github.com/acme/store/issues/2', createdAt: 'now', created: true }))
  expect(opened.opener).toBeNull()
  expect(view.ui.queryByRole('dialog')).toBeNull()
})

it('shows safe handoff preparation errors from thrown and opaque failures', async () => {
  const prepare = vi.fn()
    .mockRejectedValueOnce(new Error('Safe prepare error'))
    .mockRejectedValueOnce('opaque failure')
  const adapter = {
    ...personalComments,
    list: vi.fn().mockResolvedValue([comment]),
    externalWork: { prepare, send: vi.fn() },
  }
  const view = render(<FeedbackWidget projectId="" personalComments={adapter} viewerEmail="user@example.com" />)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'f' })
  const trigger = async () => {
    fireEvent.click(view.getByRole('button', { name: 'More' }))
    fireEvent.click(view.getByRole('button', { name: 'Send to…' }))
  }
  await trigger()
  expect(await view.findByText('Safe prepare error')).toBeInTheDocument()
  fireEvent.click(view.getByRole('button', { name: 'Dismiss error' }))
  await trigger()
  expect(await view.findByText('Could not prepare external work')).toBeInTheDocument()
})

it('deduplicates simultaneous handoff preparation requests and tolerates blocked existing-issue tabs', async () => {
  let resolvePrepare!: (value: { destination: string; title: string; body: string; existingUrl?: string }) => void
  const prepare = vi.fn().mockReturnValue(new Promise((resolve) => { resolvePrepare = resolve }))
  const adapter = {
    ...personalComments,
    list: vi.fn().mockResolvedValue([comment]),
    externalWork: { prepare, send: vi.fn() },
  }
  vi.spyOn(window, 'open').mockReturnValue(null)
  const view = render(<FeedbackWidget projectId="" personalComments={adapter} viewerEmail="user@example.com" />)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'f' })
  fireEvent.click(view.getByRole('button', { name: 'More' }))
  const send = view.getByRole('button', { name: 'Send to…' })
  act(() => { send.click(); send.click() })
  expect(prepare).toHaveBeenCalledTimes(1)
  await act(async () => resolvePrepare({ destination: 'GitHub', title: '', body: '', existingUrl: 'https://github.com/acme/store/issues/1' }))
  expect(window.open).toHaveBeenCalled()
})

it('keeps rejected personal pins unavailable for external handoff', async () => {
  const adapter = {
    ...personalComments,
    list: vi.fn().mockResolvedValue([{ ...comment, reviewStatus: 'rejected' as const }]),
    externalWork: { prepare: vi.fn(), send: vi.fn() },
  }
  const view = render(<FeedbackWidget projectId="" personalComments={adapter} viewerEmail="user@example.com" />)
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.click(view.container.querySelector('[data-fw-pin]')!)
  fireEvent.click(view.getByRole('button', { name: 'More options' }))
  expect(view.queryByRole('button', { name: 'Send to…' })).toBeNull()
})

it('focuses an existing npm widget for the same project instead of rendering a duplicate', async () => {
  const focusEmbedded = vi.fn()
  resolveProjectForPage.mockResolvedValue({ publicKey: 'project', name: 'Storefront', role: 'guest', capabilities: ['feedback:read'] })
  const page: WidgetPage = {
    url: location.href.split('#')[0], width: 1000, height: 1000, scrollX: 0, scrollY: 0,
    liveIds: [], embeddedProjectIds: ['project'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(),
    highlight: vi.fn(), focusEmbedded,
  }
  const view = setup(true, page)
  await waitFor(() => expect(focusEmbedded).toHaveBeenCalledWith('project'))
  expect(view.ui.queryByRole('button', { name: 'Open CRRT menu' })).toBeNull()
  window.dispatchEvent(new CustomEvent('crrt:activate'))
  expect(focusEmbedded).toHaveBeenCalledTimes(2)
})

it('waits for activation before focusing an existing npm widget', async () => {
  const focusEmbedded = vi.fn()
  resolveProjectForPage.mockResolvedValue({ publicKey: 'project', name: 'Storefront', role: 'guest', capabilities: ['feedback:read'] })
  const page: WidgetPage = {
    url: location.href.split('#')[0], width: 1000, height: 1000, scrollX: 0, scrollY: 0,
    liveIds: [], embeddedProjectIds: ['project'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(),
    highlight: vi.fn(), focusEmbedded,
  }
  setup(false, page)
  await waitFor(() => expect(resolveProjectForPage).toHaveBeenCalled())
  expect(focusEmbedded).not.toHaveBeenCalled()
  window.dispatchEvent(new CustomEvent('crrt:activate'))
  expect(focusEmbedded).toHaveBeenCalledWith('project')
})

it('preserves a draft and screenshot when tokens refresh for the same account', async () => {
  const view = setup()
  await act(async () => {})
  const textarea = await selectTarget(view)
  fireEvent.change(textarea, { target: { value: 'Do not lose this draft' } })
  vi.mocked(extensionSession).mockResolvedValue({ email: 'user@example.com', accessToken: 'refreshed-token' })
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  expect(view.ui.getByPlaceholderText('Leave your comment…')).toBe(textarea)
  expect(textarea).toHaveValue('Do not lose this draft')
  expect(view.ui.getByRole('button', { name: 'Remove screenshot' })).toBeInTheDocument()
  expect(view.ui.getByTitle('Signed in as user@example.com')).toHaveTextContent('U')
  vi.mocked(extensionSession).mockRejectedValueOnce(new Error('refresh offline'))
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  expect(textarea).toHaveValue('Do not lose this draft')
})

it('uses the current account email initial without asking for a display name', async () => {
  vi.mocked(extensionSession).mockResolvedValue({ email: 'admin@crrt.local', accessToken: 'token' })
  const view = setup()
  await view.ui.findByRole('button', { name: 'Open CRRT menu' })
  await selectTarget(view)
  expect(view.ui.getByTitle('Signed in as admin@crrt.local')).toHaveTextContent('A')
  fireEvent.click(view.ui.getByTitle('Signed in as admin@crrt.local'))
  expect(view.ui.queryByPlaceholderText('Your name')).toBeNull()
})

it('ignores stale account refreshes and failures after unmount, and handles initial auth failure', async () => {
  let resolve!: (session: any) => void, reject!: (error: Error) => void
  vi.mocked(extensionSession).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const view = setup()
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  await act(async () => resolve(null))
  expect(view.ui.getByRole('button', { name: 'Open CRRT menu' })).toBeInTheDocument()
  vi.mocked(extensionSession).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  await act(async () => { storage.addListener.mock.calls[0][0](); storage.addListener.mock.calls[0][0]() })
  await act(async () => reject(new Error('stale failure')))
  vi.mocked(extensionSession).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  view.unmount(); await act(async () => reject(new Error('late failure')))
  vi.mocked(extensionSession).mockRejectedValueOnce(new Error('initial failure'))
  const another = setup(); await act(async () => {})
  expect(another.ui.getByRole('button', { name: 'Open CRRT menu' })).toBeInTheDocument()
})

it('does not renew private images for the regular project widget', async () => {
  const view = render(<FeedbackWidget projectId="project" />)
  await act(async () => { fireEvent.focus(window) })
  expect(listPageComments).not.toHaveBeenCalled()
  view.unmount()
})

it('uses host page geometry, targets, selectors and navigation in the isolated editor', async () => {
  const page: WidgetPage = { url: location.href.split('#')[0], width: 2000, height: 3000, scrollX: 10, scrollY: 20,
    liveIds: ['c1'], capture: vi.fn(), selecting: vi.fn(), track: vi.fn(), highlight: vi.fn() }
  const view = setup(false, page); await act(async () => {})
  const pin = view.container.querySelector('[data-fw-pin]')!
  expect(pin).toHaveStyle({ left: '190px', top: '569px' })
  expect(page.track).toHaveBeenCalledWith([{ id: 'c1', selector: '#target', x: 10, y: 20 }])
  fireEvent.click(pin)
  fireEvent.click(view.container.querySelector('[data-fw-pin-backdrop]')!)
  await act(async () => { fireEvent.keyDown(window, { key: 'c' }) })
  expect(page.selecting).toHaveBeenCalledWith(true)
  fireEvent.mouseMove(target); fireEvent.click(target)
  expect(target.style.outline).toBe('')
  expect(view.ui.queryByPlaceholderText('Leave your comment…')).toBeNull()
  view.rerender(<ExtensionWidget activate={false} page={{ ...page, target: { selector: '#target', x: 1, y: 2, url: page.url } }} />)
  await view.ui.findByPlaceholderText('Leave your comment…')
  fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.keyDown(window, { key: 'f' })
  fireEvent.click(view.ui.getByText('First'))
  expect(page.highlight).toHaveBeenCalledWith('#target')
  view.rerender(<ExtensionWidget activate={false} page={{ ...page, url: 'https://site.test/next', liveIds: [] }} />)
  await waitFor(() => expect(listPageComments).toHaveBeenCalledWith('https://site.test/next', 1))
  expect(view.container.querySelector('[data-fw-pin]')).toBeNull()
})

it('renews private pin images without resetting edits and ignores offline or late refreshes', async () => {
  vi.useFakeTimers()
  const view = setup(); await act(async () => {})
  fireEvent.click(view.container.querySelector('[data-fw-pin]')!)
  fireEvent.click(view.ui.getByRole('button', { name: 'More options' }))
  fireEvent.click(view.ui.getByRole('button', { name: 'Edit' }))
  const editor = view.ui.getAllByRole('textbox')[0]
  fireEvent.change(editor, { target: { value: 'Unsaved edit' } })
  vi.mocked(listPageComments).mockResolvedValueOnce({ items: [{ ...comment, screenshotUrl: 'https://signed/fresh' }], total: 1 })
  await act(async () => { vi.advanceTimersByTime(240_000) })
  expect(editor).toHaveValue('Unsaved edit')
  expect(view.container.querySelector('img[src="https://signed/fresh"]')).not.toBeNull()
  vi.mocked(listPageComments).mockResolvedValueOnce({ items: [], total: 0 })
  await act(async () => fireEvent.focus(window))
  vi.mocked(listPageComments).mockRejectedValueOnce(new Error('offline'))
  await act(async () => fireEvent.focus(window))
  let resolve!: (value: any) => void
  vi.mocked(listPageComments).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  await act(async () => { fireEvent.focus(window); fireEvent.focus(window) })
  await act(async () => resolve({ items: [], total: 0 }))
  vi.mocked(listPageComments).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  fireEvent.focus(window); view.unmount()
  await act(async () => resolve({ items: [], total: 0 }))
})

it('opens extension sign-in from the logged-out carrot and restores the menu after login', async () => {
  vi.mocked(extensionSession).mockResolvedValue(null)
  const view = setup()
  await act(async () => {})
  expect(sendMessage).not.toHaveBeenCalled()
  expect(listPageComments).not.toHaveBeenCalled()
  fireEvent.click(view.ui.getByRole('button', { name: 'Open CRRT menu' }))
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'auth:open-popup' }))
  expect(view.ui.getByRole('button', { name: 'Open CRRT menu' })).toHaveAttribute('aria-expanded', 'false')
  expect(view.ui.queryByRole('menuitem', { name: /Drop comment/ })).toBeNull()
  expect(view.ui.queryByPlaceholderText('Leave your comment…')).toBeNull()
  vi.mocked(extensionSession).mockResolvedValue({ email: 'user@example.com', accessToken: 'token' })
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  fireEvent.click(view.ui.getByRole('button', { name: 'Open CRRT menu' }))
  await view.ui.findByRole('button', { name: 'Close CRRT menu' })
  expect(sendMessage).toHaveBeenCalledTimes(1)
  expect(globalThis.fetch).not.toHaveBeenCalled()
})

it('keeps the launcher closed and shows retry guidance when popup or auth fails', async () => {
  vi.mocked(extensionSession).mockResolvedValue(null)
  const view = setup()
  await act(async () => {})
  for (const response of [{ ok: false, error: 'not supported' }, undefined]) {
    sendMessage.mockResolvedValueOnce(response)
    await act(async () => { fireEvent.click(view.ui.getByRole('button', { name: 'Open CRRT menu' })) })
    expect(view.ui.getByRole('alert')).toHaveTextContent('Click CRRT in Chrome’s toolbar to sign in.')
    fireEvent.click(view.ui.getByRole('button', { name: 'Dismiss error' }))
  }
  for (const reason of [new Error('Auth unavailable'), 'offline']) {
    vi.mocked(extensionSession).mockRejectedValueOnce(reason)
    await act(async () => { fireEvent.click(view.ui.getByRole('button', { name: 'Open CRRT menu' })) })
    expect(view.ui.getByRole('alert')).toHaveTextContent(reason instanceof Error ? reason.message : 'Could not open CRRT')
    fireEvent.click(view.ui.getByRole('button', { name: 'Dismiss error' }))
  }
  expect(view.ui.getByRole('button', { name: 'Open CRRT menu' })).toHaveAttribute('aria-expanded', 'false')
})

it('persists edits/deletes and leaves failed mutations visible for retry', async () => {
  const view = setup(); await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.click(view.container.querySelector('[data-fw-pin]')!)
  expect(view.ui.queryByRole('button', { name: 'Approve' })).toBeNull()
  fireEvent.click(view.ui.getByRole('button', { name: 'More options' }))
  fireEvent.click(view.ui.getByRole('button', { name: 'Edit' }))
  const editor = view.ui.getAllByRole('textbox')[0]
  fireEvent.change(editor, { target: { value: 'Updated' } })
  vi.mocked(updatePageComment).mockRejectedValueOnce(new Error('edit down'))
  fireEvent.click(view.ui.getAllByRole('button', { name: 'Save' })[0])
  await view.ui.findByText('edit down')
  fireEvent.click(view.ui.getByRole('button', { name: 'Dismiss error' }))
  fireEvent.click(view.ui.getAllByRole('button', { name: 'Save' })[0])
  await waitFor(() => expect(view.ui.queryAllByRole('textbox')).toHaveLength(0))
  expect(updatePageComment).toHaveBeenLastCalledWith('c1', 'Updated')
  fireEvent.click(view.ui.getByRole('button', { name: 'More options' }))
  vi.mocked(deletePageComment).mockRejectedValueOnce(new Error('delete down'))
  fireEvent.click(view.ui.getByRole('button', { name: 'Delete' }))
  await view.ui.findByText('delete down')
  expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull()
  fireEvent.keyDown(window, { key: 'f' })
  fireEvent.click(view.ui.getByRole('button', { name: 'More' }))
  expect(view.ui.queryByRole('button', { name: 'Approve' })).toBeNull()
  fireEvent.click(view.ui.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).toBeNull())
  expect(deletePageComment).toHaveBeenCalledWith('c1')
  expect(globalThis.fetch).not.toHaveBeenCalled()
})

it('shows load and submit errors; clearing auth removes private pins', async () => {
  vi.mocked(listPageComments).mockRejectedValueOnce(new Error('load down'))
  const view = setup(); await view.ui.findByText('load down')
  const textarea = await selectTarget(view)
  fireEvent.click(view.ui.getByRole('button', { name: 'Remove screenshot' }))
  fireEvent.change(textarea, { target: { value: 'New' } })
  vi.mocked(createPageComment).mockRejectedValueOnce('offline')
  fireEvent.click(view.ui.getByRole('button', { name: 'Send' })); await view.ui.findByText('Could not save comment')
  vi.mocked(createPageComment).mockRejectedValueOnce(new Error('Sign in from the extension'))
  fireEvent.click(view.ui.getByRole('button', { name: 'Send' })); await view.ui.findByText('Sign in from the extension')
  expect(createPageComment).toHaveBeenLastCalledWith(expect.objectContaining({ screenshot: null }))
  vi.mocked(extensionSession).mockResolvedValue({ email: 'another@example.com', accessToken: 'other' })
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  vi.mocked(extensionSession).mockResolvedValue(null)
  await act(async () => { storage.addListener.mock.calls[0][0]() })
  expect(view.container.querySelector('[data-fw-pin]')).toBeNull()
  expect(view.ui.queryByRole('textbox')).toBeNull()
  view.unmount(); expect(storage.removeListener).toHaveBeenCalled()
})

it('paginates personal pins, preserves text anchors, and refreshes on SPA navigation', async () => {
  const anchor = { kind: 'text_range', selectedText: 'quote' } as const
  vi.mocked(listPageComments).mockResolvedValueOnce({ items: [comment], total: 2 }).mockResolvedValueOnce({ items: [{ ...comment, id: 'c2' }], total: 2 })
  expect(await personalComments.list(location.href)).toHaveLength(2)
  expect(listPageComments).toHaveBeenLastCalledWith(location.href, 2)
  vi.mocked(listPageComments).mockResolvedValueOnce({ items: [], total: 2 })
  expect(await personalComments.list(location.href)).toEqual([])
  await personalComments.create({ pageUrl: location.href, body: 'quote', selector: '#target', x: 1, y: 2, targetType: 'text_range', anchor })
  expect(createPageComment).toHaveBeenLastCalledWith(expect.objectContaining({ targetType: 'text_range', anchor, screenshot: null }))
  const view = setup(true)
  await waitFor(() => expect(listPageComments).toHaveBeenCalled())
  const original = location.href
  history.pushState({}, '', '/next?query=retained#fragment')
  await waitFor(() => expect(listPageComments).toHaveBeenCalledWith(location.href.split('#')[0], 1))
  view.unmount(); history.replaceState({}, '', original)
})

it('ignores a late load failure after the widget unmounts', async () => {
  let reject!: (error: Error) => void
  vi.mocked(listPageComments).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  const view = setup(); await waitFor(() => expect(listPageComments).toHaveBeenCalled())
  view.unmount()
  await act(async () => { reject(new Error('late failure')) })
  expect(view.container).toBeEmptyDOMElement()
})

it('declares automatic HTTP(S) injection, avoids duplicate widgets, and supports popup activation', async () => {
  expect(autoload.matches).toEqual(['http://*/*', 'https://*/*'])
  expect(config.manifest).toMatchObject({ host_permissions: ['http://*/*', 'https://*/*'] })
  expect((config.vite as () => unknown)()).toEqual({ build: { assetsInlineLimit: Infinity } })
  const icons = { 16: 'icon.png', 32: 'icon.png', 48: 'icon.png', 128: 'icon.png' }
  expect(config.manifest).toMatchObject({ icons, action: { default_icon: icons } })
  const assets: { absoluteSrc: string; relativeDest: string }[] = []
  const hooks = config.hooks as { 'build:publicAssets': (wxt: { config: { root: string } }, files: typeof assets) => void }
  hooks['build:publicAssets']({ config: { root: resolve('apps/extension') } }, assets)
  expect(assets).toHaveLength(1)
  expect(assets[0].relativeDest).toBe('icon.png')
  expect(readFileSync(assets[0].absoluteSrc)).toEqual(readFileSync('branding/design-system-crrt/Frame 11.png'))
  const spy = vi.spyOn(window, 'dispatchEvent')
  const attach = vi.spyOn(Element.prototype, 'attachShadow')
  await act(async () => { autoload.main({} as never) })
  const host = document.querySelector('[data-crrt-extension]')!
  expect(attach).toHaveBeenCalledWith({ mode: 'closed' })
  expect(attach.mock.results[0].value.querySelector('[data-fw-crrt]')).toBeNull()
  expect(attach.mock.results[0].value.querySelector('iframe')).toHaveAttribute('src', 'chrome-extension://test/private.html')
  const frame = attach.mock.results[0].value.querySelector('iframe') as HTMLIFrameElement
  expect(frame).toHaveAttribute('allow', 'microphone')
  const page = new DOMParser().parseFromString(readFileSync('apps/extension/entrypoints/private/index.html', 'utf8'), 'text/html')
  expect(frame.style.colorScheme).toBe('light')
  expect(page.documentElement.style.colorScheme).toBe(frame.style.colorScheme)
  expect(frame.style.background).toBe('transparent')
  expect(page.documentElement.style.background).toBe('transparent')
  expect(page.body.style.background).toBe('transparent')
  expect(host.shadowRoot).toBeNull()
  mountWidget(); expect(document.querySelectorAll('[data-crrt-extension]')).toHaveLength(1)
  expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'crrt:activate' }))
  await act(async () => { (script as unknown as () => void)() })
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'crrt:activate' }))
})

it('keeps private text, signed images, and mutation controls inaccessible to page DOM scripts', async () => {
  const view = setup()
  await waitFor(() => expect(view.container.querySelector('[data-fw-pin]')).not.toBeNull())
  fireEvent.click(view.container.querySelector('[data-fw-pin]')!)
  expect(view.ui.getAllByText('First').length).toBeGreaterThan(0)
  expect(view.container.querySelector('img[src="https://signed/one"]')).not.toBeNull()
  // Test code holds the root directly; the visited page has only the shared host.
  expect(view.host.shadowRoot).toBeNull()
  expect(view.host.textContent).toBe('')
  expect(document.querySelector('[data-crrt-extension] button')).toBeNull()
  expect(document.querySelector('img[src="https://signed/one"]')).toBeNull()
  fireEvent.click(view.host)
  expect(deletePageComment).not.toHaveBeenCalled()
  expect(updatePageComment).not.toHaveBeenCalled()
})
