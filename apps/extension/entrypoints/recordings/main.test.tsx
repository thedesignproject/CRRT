import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), listRecordings: vi.fn(), cloudList: vi.fn() }))
const roots = vi.hoisted(() => [] as { unmount: () => void }[])

vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root = actual.createRoot(...args)
    roots.push(root)
    return root
  } }
})

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount() })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  getURL: (path: string) => `chrome-extension://test${path}`,
} } }))
vi.mock('../../lib/recording-cloud', () => ({ ownerRecordRequest: mocks.cloudList }))
vi.mock('../../lib/recording-store', () => ({ listLocalRecordings: mocks.listRecordings }))

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  document.body.innerHTML = '<div id="root"></div>'
  mocks.listRecordings.mockResolvedValue([])
  mocks.cloudList.mockResolvedValue({ recordings: [], next: null })
  vi.stubEnv('WXT_DASHBOARD_URL', 'http://127.0.0.1:5177/dashboard/')
  mocks.sendMessage.mockResolvedValue({ ok: true })
})

it('renders the real library and launches a new capture', async () => {
  await import('./main')
  expect(await screen.findByRole('heading', { name: 'Recordings' })).toBeInTheDocument()
  expect(screen.queryByText('Checkout: pay button barely readable')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:open' })
})

it('deletes uploaded recordings through the authenticated owner API', async () => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  mocks.cloudList.mockResolvedValueOnce({ recordings: [{ id: 'cloud', title: 'Uploaded capture', state: 'ready', markCount: 1 }], next: null })
  await import('./main')
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Uploaded capture' }))
  expect(mocks.cloudList).toHaveBeenCalledWith('recordings/cloud', undefined, 'DELETE')
  expect(await screen.findByRole('status')).toHaveTextContent('Recording deleted')
})

it('links uploaded captures to the owner player and paginates the server library', async () => {
  mocks.cloudList.mockResolvedValueOnce({ recordings: [{ id: 'cloud', title: 'Uploaded capture', state: 'ready', markCount: 1 }], next: 'cloud' }).mockResolvedValueOnce({ recordings: [], next: null })
  await import('./main')
  expect(await screen.findByRole('link', { name: /Uploaded capture/ })).toHaveAttribute('href', 'http://127.0.0.1:5177/dashboard/recording?id=cloud')
  fireEvent.click(screen.getByRole('button', { name: 'Load more recordings' }))
  expect(mocks.cloudList).toHaveBeenCalledWith('recordings?before=cloud')
})

it('shows local captures in All and Mine but not client filters', async () => {
  mocks.listRecordings.mockResolvedValue([{
    id: 'local', title: 'Local checkout', source: 'tab', status: 'ready', durationMs: 8_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [{ id: 'pin', type: 'pin', atMs: 2_000, points: [{ x: 10, y: 10 }], pinNumber: 1 }], transcript: [],
    transcriptionStatus: 'failed',
    thumbnailDataUrl: 'data:image/jpeg;base64,eA==',
  }, {
    id: 'plain', title: 'Plain capture', source: 'screen', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-23T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [],
    transcriptionStatus: 'processing',
  }, {
    id: 'ready', title: 'Ready capture', source: 'window', status: 'ready', durationMs: 2_000,
    createdAt: '2026-10-22T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [],
    transcriptionStatus: 'ready',
  }])
  await import('./main')
  expect(await screen.findByText('Local checkout')).toBeInTheDocument()
  expect(screen.getByText('Transcript failed')).toBeInTheDocument()
  expect(screen.getByText('Transcribing')).toBeInTheDocument()
  expect(screen.getByText('Ready')).toBeInTheDocument()

})

it.each([{ ok: false, error: 'Open failed' }, { ok: false }, undefined, 'rejected'])('shows launcher failures instead of ignoring them: %j', async (failure) => {
  await import('./main')
  await screen.findByRole('heading', { name: 'Recordings' })
  if (failure === 'rejected') mocks.sendMessage.mockRejectedValueOnce('worker disconnected')
  else mocks.sendMessage.mockResolvedValueOnce(failure)
  fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent(failure && typeof failure === 'object' && 'error' in failure ? 'Open failed' : 'Could not open the recorder')
})
