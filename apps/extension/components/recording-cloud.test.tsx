import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalRecording } from '../lib/recording'
const mocks = vi.hoisted(() => ({ sync: vi.fn(), playback: vi.fn(), request: vi.fn(), send: vi.fn(), save: vi.fn(), projects: vi.fn(), resolve: vi.fn(), attach: vi.fn() }))
vi.mock('../lib/comments-api', () => ({ listExtensionProjects: mocks.projects }))
vi.mock('../lib/project-context', () => ({ resolveProjectForPage: mocks.resolve }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: mocks.send } } }))
vi.mock('../lib/recording-cloud', () => ({ isMissingCloudRecording: (error: unknown) => error instanceof Error && 'code' in error && error.code === 'record_not_found', syncRecording: mocks.sync, readRecordingPlayback: mocks.playback, ownerRecordRequest: mocks.request, attachRecordingProject: mocks.attach }))
vi.mock('../lib/recording-store', () => ({ saveLocalRecording: mocks.save }))
import { canAttachRecording, RecordingAgentContext, RecordingCloud } from './recording-cloud'
const recording = (finalized?: boolean): LocalRecording => ({ id: 'local', title: 'Video', source: 'tab', authorName: 'You', createdAt: 'now', status: 'ready', transcriptionStatus: 'processing', durationMs: 1000, marks: [], transcript: [], ...(finalized === undefined ? {} : { cloud: { id: 'remote', authorId: 'owner', shareId: 'capability', manifest: { version: 'record.v1', artifacts: [], events: [], durationMs: 1000 }, uploads: {}, finalized } }) })
const playback = (state = 'ready', stage = 'done') => ({ recording: { state, failure: null }, stages: [{ stage: 'transcription', state: stage }], transcript: [{ id: 's', text: 'Speech', start_ms: 100, end_ms: 500 }] })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('WXT_DASHBOARD_URL', 'https://app.test/dashboard/')
  mocks.sync.mockResolvedValue(recording(true)); mocks.playback.mockResolvedValue(playback()); mocks.request.mockImplementation(async path => path.endsWith('/share') ? { shareId: 'capability' } : { payload: 'paid context' }); mocks.save.mockResolvedValue(undefined)
  mocks.projects.mockResolvedValue([]); mocks.resolve.mockResolvedValue(null)
  mocks.attach.mockImplementation(async (value: LocalRecording, projectKey: string | null) => ({ ...value, projectKey, cloud: value.cloud && { ...value.cloud, projectKey } }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('uploads automatically, reports errors and retries without discarding the local recording', async () => {
  mocks.sync.mockRejectedValueOnce(new Error('Sign in to CRRT to upload recordings.'))
  const changed = vi.fn(); render(<RecordingCloud recording={recording()} changed={changed} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in')
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to CRRT' }))
  expect(mocks.send).toHaveBeenCalledWith({ type: 'auth:open-popup' })
  fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }))
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2))
  expect(screen.getByText('Saved in this browser')).toBeInTheDocument()
})
it('exposes the early human link while upload is still in progress', async () => {
  mocks.sync.mockReturnValue(new Promise(() => {}))
  render(<RecordingCloud recording={recording(false)} changed={vi.fn()} />)
  expect(screen.getByText(/Uploading recording/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
  expect(await screen.findByText('Share link copied')).toBeInTheDocument()
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.test/dashboard/recording#capability')
})
it('reports clipboard failures', async () => {
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
  render(<RecordingCloud recording={recording(false)} changed={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy')
})
it('recovers an older oversized note through explicit editing before upload without changing the media', async () => {
  const original = { ...recording(), screenBlob: new Blob(['retained media']), marks: [{ id: 'note', type: 'text' as const, atMs: 100, points: [{ x: 50, y: 50 }], text: 'x'.repeat(2001) }] }
  const changed = vi.fn()
  render(<RecordingCloud recording={original} changed={changed} />)
  expect(mocks.sync).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Retry upload' })).toBeNull()
  expect(screen.getByRole('textbox')).toHaveValue('x'.repeat(2001))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My shortened note' } })
  expect(original.marks[0].text).toHaveLength(2001)
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'My shortened note', screenBlob: original.screenBlob, marks: [expect.objectContaining({ text: 'My shortened note', atMs: 100 })] }))
  expect(mocks.sync.mock.calls[0][0].screenBlob).toBe(original.screenBlob)
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0])
  expect(original.marks[0].text).toHaveLength(2001)
})
it('uploads ordinary notes and non-text marks without showing the recovery editor', async () => {
  const original = { ...recording(), marks: [
    { id: 'pin', type: 'pin' as const, atMs: 0, points: [{ x: 1, y: 1 }] },
    { id: 'note', type: 'text' as const, atMs: 1, points: [{ x: 1, y: 1 }], text: 'x'.repeat(2000) },
  ] }
  render(<RecordingCloud recording={original} changed={vi.fn()} />)
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
  expect(screen.queryByRole('region', { name: 'Shorten oversized notes' })).toBeNull()
})
it('retains the original note when local persistence fails and retries repair before upload', async () => {
  const original = { ...recording(), pageTitle: 'Checkout', marks: [{ id: 'note', type: 'text' as const, atMs: 0, points: [{ x: 1, y: 1 }], text: 'x'.repeat(2001) }] }
  mocks.save.mockRejectedValueOnce(new Error('Disk unavailable'))
  render(<RecordingCloud recording={original} changed={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited note' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your original recording is still available')
  expect(mocks.sync).not.toHaveBeenCalled()
  expect(original.marks[0].text).toHaveLength(2001)
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
  expect(mocks.sync.mock.calls[0][0].pageTitle).toBe('Checkout')
})
it('does not copy a cached capability after the owner unshares the recording', async () => {
  mocks.request.mockResolvedValue({ shareId: null })
  render(<RecordingCloud recording={recording(false)} changed={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sharing is off')
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledWith('recordings/remote/share')
})
it.each([['done', 'ready'], ['failed', 'failed'], ['running', 'processing'], [undefined, 'processing']])('polls authoritative transcript state %s', async (stage, expected) => {
  const result = playback('processing', stage); if (stage === undefined) result.stages = []
  mocks.playback.mockResolvedValue(result)
  const changed = vi.fn(); render(<RecordingCloud recording={{ ...recording(true), hostedTranscription: true }} changed={changed} />)
  expect(await screen.findByText('Recording processing')).toBeInTheDocument()
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ transcript: [{ id: 's', text: 'Speech', startMs: 100, endMs: 500 }], transcriptionStatus: expected })))
})
it.each(['running', 'queued', undefined])('does not report transcription while consent is off and the stage is %s', async (stage) => {
  const result = playback('processing', stage); if (stage === undefined) result.stages = []
  mocks.playback.mockResolvedValue(result)
  const changed = vi.fn(); render(<RecordingCloud recording={{ ...recording(true), hostedTranscription: false }} changed={changed} />)
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ transcriptionStatus: 'ready' })))
})
it('keeps polling for signed state and stops after unmount', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const { unmount } = render(<RecordingCloud recording={recording(true)} changed={vi.fn()} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(mocks.playback).toHaveBeenCalledTimes(2)
  unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(mocks.playback).toHaveBeenCalledTimes(2)
})
it('reports playback failures and retries an authorized failed stage', async () => {
  mocks.playback.mockRejectedValueOnce(new Error('Unavailable'))
  const view = render(<RecordingCloud recording={recording(true)} changed={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  view.unmount()
  mocks.playback.mockResolvedValue({ ...playback('failed'), stages: [{ stage: 'metadata', state: 'failed', failure: { retryable: true, stage: 'metadata' } }], recording: { state: 'failed', failure: { retryable: true, stage: 'metadata' } } })
  render(<RecordingCloud recording={recording(true)} changed={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry video' }))
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('recordings/remote/retry', { stage: 'metadata' }))
})
it('reports processing retry errors', async () => {
  mocks.playback.mockResolvedValue({ ...playback('failed'), stages: [{ stage: 'transcription', state: 'failed', failure: { retryable: true, stage: 'transcription' } }], recording: { state: 'failed', failure: { retryable: true, stage: 'transcription' } } })
  mocks.request.mockRejectedValue(new Error('Cannot retry'))
  render(<RecordingCloud recording={recording(true)} changed={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry transcription' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot retry')
})
it('discards in-flight playback results and failures after unmount', async () => {
  let resolve!: (v: unknown) => void
  mocks.playback.mockReturnValue(new Promise(r => { resolve = r }))
  const changed = vi.fn(), first = render(<RecordingCloud recording={recording(true)} changed={changed} />)
  first.unmount(); await act(async () => { resolve(playback()) }); expect(changed).not.toHaveBeenCalled()
  let reject!: (e: unknown) => void
  mocks.playback.mockReturnValue(new Promise((_r, j) => { reject = j }))
  const second = render(<RecordingCloud recording={recording(true)} changed={changed} />)
  second.unmount(); await act(async () => { reject(new Error('late')) })
})

it('does not change the review after unmount while a transcript save is pending', async () => {
  let resolve!: () => void
  mocks.save.mockReturnValue(new Promise<void>(r => { resolve = r }))
  const changed = vi.fn(), view = render(<RecordingCloud recording={recording(true)} changed={changed} />)
  await waitFor(() => expect(mocks.save).toHaveBeenCalled())
  view.unmount()
  await act(async () => { resolve() })
  expect(changed).not.toHaveBeenCalled()
})
it('disables agent requests until upload finalization', () => {
  render(<RecordingAgentContext recording={recording()} />)
  expect(screen.getByRole('button', { name: 'Generate agent context' })).toBeDisabled()
})
it('requests paid context on the server and copies the authorized result with a stable retry key', async () => {
  render(<RecordingAgentContext recording={recording(true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate agent context' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Copy for agent' }))
  expect(await screen.findByText('Copied for agent')).toBeInTheDocument()
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ payload: 'paid context' }, null, 2))
  fireEvent.click(screen.getByRole('button', { name: 'Generate agent context' }))
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
  expect(mocks.request.mock.calls[0][1]).toEqual(mocks.request.mock.calls[1][1])
})
it('surfaces backend entitlement and clipboard failures', async () => {
  mocks.request.mockRejectedValueOnce(new Error('A paid plan is required'))
  render(<RecordingAgentContext recording={recording(true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate agent context' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('paid plan')
  fireEvent.click(screen.getByRole('button', { name: 'Generate agent context' }))
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
  fireEvent.click(await screen.findByRole('button', { name: 'Copy for agent' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed')
})

it('keeps deleted captures local until an explicit fresh upload and hides stale sharing and agent actions', async () => {
  const deleted = { ...recording(true), cloud: { ...recording(true).cloud!, deleted: true, shareId: null } }
  mocks.sync.mockResolvedValue(deleted)
  const changed = vi.fn(), view = render(<RecordingCloud recording={deleted} changed={changed} />)
  expect(await screen.findByText('Cloud recording deleted')).toBeInTheDocument()
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(deleted, changed, false))
  expect(mocks.playback).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Copy share link' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Upload again' }))
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith(deleted, changed, true))
  view.unmount()
  render(<RecordingAgentContext recording={deleted} />)
  expect(screen.getByRole('button', { name: 'Generate agent context' })).toBeDisabled()
})

it('detects cloud deletion during playback polling and clears obsolete playback', async () => {
  const original = recording(true)
  const deleted = { ...original, cloud: { ...original.cloud!, deleted: true, shareId: null } }
  mocks.sync.mockImplementation(async (_input, changed) => { changed(deleted); return deleted })
  mocks.playback.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'record_not_found' }))
  const changed = vi.fn()
  const view = render(<RecordingCloud recording={original} changed={changed} />)
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2))
  expect(changed).toHaveBeenCalledWith(deleted)
  view.rerender(<RecordingCloud recording={deleted} changed={changed} />)
  expect(screen.getByText('Cloud recording deleted')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy share link' })).toBeNull()
})

const projects = [
  { publicKey: 'store', name: 'Storefront', allowedOrigins: ['store.test'], role: 'admin' as const },
  { publicKey: 'docs', name: 'Docs', allowedOrigins: [], role: 'member' as const },
  { publicKey: 'guest', name: 'Guest project', allowedOrigins: [], role: 'guest' as const },
]
it('defaults the recording to the page destination, attaches it after upload, and lets the owner move it', async () => {
  mocks.projects.mockResolvedValue(projects)
  mocks.resolve.mockResolvedValue({ publicKey: 'store', name: 'Storefront' })
  const initial = { ...recording(), pageUrl: 'https://store.test/cart' }
  mocks.sync.mockResolvedValue({ ...recording(true), pageUrl: 'https://store.test/cart' })
  const changed = vi.fn()
  const view = render(<RecordingCloud recording={initial} changed={changed} />)
  const picker = await screen.findByRole('combobox', { name: 'Recording project' })
  expect(screen.queryByRole('option', { name: 'Guest project' })).not.toBeInTheDocument()
  expect(mocks.resolve).toHaveBeenCalledWith('https://store.test/cart', projects.slice(0, 2))
  await waitFor(() => expect(picker).toHaveValue('store'))
  // Nothing is attached before the cloud copy exists.
  expect(mocks.attach).not.toHaveBeenCalled()
  view.rerender(<RecordingCloud recording={{ ...recording(true), pageUrl: 'https://store.test/cart' }} changed={changed} />)
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ id: 'local' }), 'store'))
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'store' })))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'store' }))
  const attached = { ...recording(true), projectKey: 'store', cloud: { ...recording(true).cloud!, projectKey: 'store' } }
  view.rerender(<RecordingCloud recording={attached} changed={changed} />)
  mocks.attach.mockClear()
  fireEvent.change(picker, { target: { value: '' } })
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'store' }), null))
})
it('keeps an existing choice, skips attaching when it already matches, and reports attach failures', async () => {
  mocks.projects.mockResolvedValue(projects)
  const attached = { ...recording(true), projectKey: 'docs', cloud: { ...recording(true).cloud!, projectKey: 'docs' } }
  mocks.sync.mockResolvedValue(attached)
  const view = render(<RecordingCloud recording={attached} changed={vi.fn()} />)
  const picker = await screen.findByRole('combobox', { name: 'Recording project' })
  expect(picker).toHaveValue('docs')
  expect(mocks.resolve).not.toHaveBeenCalled()
  await act(async () => {})
  expect(mocks.attach).not.toHaveBeenCalled()
  mocks.attach.mockRejectedValueOnce(new Error('record_forbidden'))
  fireEvent.change(picker, { target: { value: 'store' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not move this recording to that project')
  // The picker returns to what the server still has, and the message survives status polling.
  await waitFor(() => expect(picker).toHaveValue('docs'))
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByRole('alert')).toHaveTextContent('Could not move this recording to that project')
  fireEvent.change(picker, { target: { value: 'store' } })
  await waitFor(() => expect(screen.queryByText(/Could not move this recording/)).not.toBeInTheDocument())
  view.unmount()
})
it('defaults recordings without a page to private and hides the picker without projects', async () => {
  mocks.projects.mockResolvedValueOnce(projects)
  render(<RecordingCloud recording={recording()} changed={vi.fn()} />)
  expect(await screen.findByRole('combobox', { name: 'Recording project' })).toHaveValue('')
  expect(mocks.resolve).not.toHaveBeenCalled()
})
it('hides the picker when projects cannot load', async () => {
  mocks.projects.mockRejectedValueOnce(new Error('Sign in'))
  render(<RecordingCloud recording={recording()} changed={vi.fn()} />)
  await act(async () => {})
  expect(screen.queryByRole('combobox', { name: 'Recording project' })).not.toBeInTheDocument()
})
it('ignores project results that arrive after the review closes', async () => {
  let finish!: (value: unknown) => void
  mocks.projects.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(<RecordingCloud recording={recording()} changed={vi.fn()} />)
  view.unmount()
  await act(async () => { finish(projects) })
  let resolved!: (value: unknown) => void
  mocks.projects.mockResolvedValueOnce(projects)
  mocks.resolve.mockReturnValueOnce(new Promise(resolve => { resolved = resolve }))
  const second = render(<RecordingCloud recording={{ ...recording(), pageUrl: 'https://store.test/' }} changed={vi.fn()} />)
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalled())
  second.unmount()
  await act(async () => { resolved({ publicKey: 'store', name: 'Storefront' }) })
})
it('does not report an attach that finishes after the review closes', async () => {
  mocks.projects.mockResolvedValue(projects)
  let settle!: (value: LocalRecording) => void
  mocks.attach.mockReturnValueOnce(new Promise(resolve => { settle = resolve }))
  const changed = vi.fn()
  const value = { ...recording(true), projectKey: 'docs' }
  mocks.sync.mockResolvedValue(value)
  const view = render(<RecordingCloud recording={value} changed={changed} />)
  await waitFor(() => expect(mocks.attach).toHaveBeenCalled())
  view.unmount()
  changed.mockClear()
  await act(async () => { settle({ ...value, cloud: { ...value.cloud!, projectKey: 'docs' } }) })
  expect(changed).not.toHaveBeenCalled()
})

it('reopens an uploaded recording with the server project instead of the page default', async () => {
  mocks.projects.mockResolvedValue(projects)
  mocks.resolve.mockResolvedValue({ publicKey: 'store', name: 'Storefront' })
  mocks.request.mockImplementation(async (path: string) => path === 'recordings/remote' ? { recording: { projectKey: null } } : { shareId: 'capability' })
  const reopened = { ...recording(true), pageUrl: 'https://store.test/cart' }
  mocks.sync.mockResolvedValue(reopened)
  const changed = vi.fn()
  render(<RecordingCloud recording={reopened} changed={changed} />)
  const picker = await screen.findByRole('combobox', { name: 'Recording project' })
  await waitFor(() => expect(picker).toHaveValue(''))
  expect(mocks.resolve).not.toHaveBeenCalled()
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ projectKey: null, cloud: expect.objectContaining({ projectKey: null }) }))
  await act(async () => {})
  expect(mocks.attach).not.toHaveBeenCalled()
})
it('keeps the picker locked when the server project cannot be read or the cloud copy is gone', async () => {
  mocks.projects.mockResolvedValue(projects)
  mocks.request.mockRejectedValue(new Error('offline'))
  const view = render(<RecordingCloud recording={recording(true)} changed={vi.fn()} />)
  expect(await screen.findByRole('combobox', { name: 'Recording project' })).toBeDisabled()
  view.unmount()
  mocks.request.mockClear()
  const deleted = { ...recording(true), cloud: { ...recording(true).cloud!, deleted: true } }
  mocks.sync.mockResolvedValue(deleted)
  render(<RecordingCloud recording={deleted} changed={vi.fn()} />)
  expect(await screen.findByRole('combobox', { name: 'Recording project' })).toBeDisabled()
  expect(mocks.request).not.toHaveBeenCalledWith('recordings/remote')
})
it('drops a server project read that lands after the review closes', async () => {
  mocks.projects.mockResolvedValue(projects)
  let respond!: (value: unknown) => void
  mocks.request.mockImplementation((path: string) => path === 'recordings/remote' ? new Promise(resolve => { respond = resolve }) : Promise.resolve({}))
  const changed = vi.fn()
  const view = render(<RecordingCloud recording={recording(true)} changed={changed} />)
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('recordings/remote'))
  view.unmount(); changed.mockClear()
  await act(async () => { respond({ recording: {} }) })
  expect(changed).not.toHaveBeenCalled()
})
it('offers only projects the server lets this member attach recordings to', () => {
  expect(canAttachRecording({ ...projects[0], capabilities: ['feedback:read', 'feedback:create', 'feedback:manage'] })).toBe(true)
  // Members of admin-only private projects receive just feedback:create.
  expect(canAttachRecording({ ...projects[1], capabilities: ['feedback:create'] })).toBe(false)
  expect(canAttachRecording(projects[1])).toBe(true)
  expect(canAttachRecording(projects[2])).toBe(false)
})
it('merges a finished attach onto the latest copy instead of a stale snapshot', async () => {
  mocks.projects.mockResolvedValue(projects)
  const value = { ...recording(true), projectKey: 'docs', cloud: { ...recording(true).cloud!, projectKey: 'docs' } }
  mocks.sync.mockResolvedValue(value)
  const changed = vi.fn()
  const view = render(<RecordingCloud recording={value} changed={changed} />)
  const picker = await screen.findByRole('combobox', { name: 'Recording project' })
  await waitFor(() => expect(mocks.sync).toHaveBeenCalled())
  await act(async () => {})
  let settle!: () => void
  mocks.attach.mockReturnValueOnce(new Promise<void>(resolve => { settle = resolve }))
  fireEvent.change(picker, { target: { value: 'store' } })
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith(expect.anything(), 'store'))
  const newer = { ...value, transcript: [{ id: 'kept', startMs: 0, endMs: 1, text: 'Kept' }] }
  view.rerender(<RecordingCloud recording={newer} changed={changed} />)
  await act(async () => { settle() })
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ projectKey: 'store', transcript: newer.transcript, cloud: expect.objectContaining({ projectKey: 'store' }) })))
})
