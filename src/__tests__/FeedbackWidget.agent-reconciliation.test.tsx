import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { WidgetPage } from '../components/FeedbackWidget/types'

const mocks = vi.hoisted(() => ({ login: null as any, list: vi.fn() }))
vi.mock('../components/FeedbackWidget/useWidgetLogin', () => ({ useWidgetLogin: () => mocks.login }))
vi.mock('../components/AgentBridgeModal', () => ({ AgentBridgeModal: ({ onFeedbackChanged, onClose }: any) => <div><button onClick={onFeedbackChanged}>Reconcile Agent feedback</button><button onClick={onClose}>Close test Agent</button></div> }))
vi.mock('../lib/screenshotCapture', () => ({ useScreenshotCapture: () => ({ image: null, previewUrl: null, status: 'idle', capture: vi.fn(), clear: vi.fn(), toBase64: async () => null }) }))
import { FeedbackWidget } from '../components/FeedbackWidget'

const session = { accessToken: `crrt_widget_${'a'.repeat(43)}`, displayName: 'Ada', expiresAt: '2099-01-01' }
function adapter() { return { list: mocks.list, create: vi.fn(), update: vi.fn(), remove: vi.fn() } }
function comment(body: string, url: string) { return { id: body, body, authorName: 'Ada', pageUrl: url, selector: 'body', x: 20, y: 20, reviewStatus: 'open', implementationStatus: 'unassigned', createdAt: new Date().toISOString() } }
function page(url: string): WidgetPage { return { url, width: 800, height: 600, scrollX: 0, scrollY: 0, liveIds: [], capture: async () => null, selecting: vi.fn(), track: vi.fn(), highlight: vi.fn() } }

beforeEach(() => {
  mocks.list.mockReset()
  mocks.login = { session, comments: adapter(), busy: false, error: '', login: vi.fn(), logout: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')))
})
afterEach(() => vi.unstubAllGlobals())

it.each(['project', 'api', 'session', 'page', 'unmount'] as const)('discards pending parent Agent reconciliation after changing %s', async (change) => {
  const oldUrl = 'https://site.test/old'
  const nextUrl = change === 'page' ? 'https://site.test/new' : oldUrl
  mocks.list.mockResolvedValue([comment('Original feedback', oldUrl)])
  const props = { projectId: 'original-project', apiBase: 'https://api.test', page: page(oldUrl) }
  const view = render(<FeedbackWidget {...props} />)
  await act(async () => { fireEvent.keyDown(window, { key: 'f' }) })
  await waitFor(() => expect(screen.getByText('Original feedback')).toBeInTheDocument())
  await act(async () => { fireEvent.keyDown(window, { key: 'A', shiftKey: true }) })
  let finish!: (comments: ReturnType<typeof comment>[]) => void
  mocks.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { fireEvent.click(screen.getByText('Reconcile Agent feedback')) })
  await act(async () => { fireEvent.click(screen.getByText('Close test Agent')) })
  if (change === 'unmount') view.unmount()
  else {
    if (change === 'session') mocks.login = { ...mocks.login, session: { ...session, accessToken: 'new-token' }, comments: adapter() }
    mocks.list.mockResolvedValue([comment('Current feedback', nextUrl)])
    const next = { ...props, ...(change === 'project' ? { projectId: 'new-project' } : change === 'api' ? { apiBase: 'https://new-api.test' } : change === 'page' ? { page: page(nextUrl) } : {}) }
    view.rerender(<FeedbackWidget {...next} />)
    await act(async () => { fireEvent.keyDown(window, { key: 'f' }) })
    await waitFor(() => expect(screen.getByText('Current feedback')).toBeInTheDocument())
  }
  await act(async () => { finish([comment('Stale Agent feedback', nextUrl)]) })
  expect(screen.queryByText('Stale Agent feedback')).toBeNull()
  if (change !== 'unmount') expect(screen.getByText('Current feedback')).toBeInTheDocument()
})

it('applies parent Agent reconciliation while its context is current', async () => {
  const url = 'https://site.test/current'
  mocks.list.mockResolvedValue([comment('Original feedback', url)])
  render(<FeedbackWidget projectId="p" page={page(url)} />)
  await act(async () => { fireEvent.keyDown(window, { key: 'A', shiftKey: true }) })
  mocks.list.mockResolvedValueOnce([comment('Updated Agent feedback', url)])
  await act(async () => { fireEvent.click(screen.getByText('Reconcile Agent feedback')) })
  await act(async () => { fireEvent.click(screen.getByText('Close test Agent')); fireEvent.keyDown(window, { key: 'f' }) })
  await waitFor(() => expect(screen.getByText('Updated Agent feedback')).toBeInTheDocument())
})

it('keeps the current feed when Agent reconciliation fails', async () => {
  const url = 'https://site.test/current'
  mocks.list.mockResolvedValue([comment('Current feedback', url)])
  render(<FeedbackWidget projectId="p" page={page(url)} />)
  await act(async () => { fireEvent.keyDown(window, { key: 'A', shiftKey: true }) })
  mocks.list.mockRejectedValueOnce(Error('local connection failed'))
  await act(async () => { fireEvent.click(screen.getByText('Reconcile Agent feedback')) })
  await act(async () => { fireEvent.click(screen.getByText('Close test Agent')); fireEvent.keyDown(window, { key: 'f' }) })
  await waitFor(() => expect(screen.getByText('Current feedback')).toBeInTheDocument())
})
