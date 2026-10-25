import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), listRecordings: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { runtime: {
  sendMessage: mocks.sendMessage,
  getURL: (path: string) => `chrome-extension://test${path}`,
} } }))
vi.mock('../../lib/recording-store', () => ({ listLocalRecordings: mocks.listRecordings }))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"></div>'
  mocks.listRecordings.mockResolvedValue([])
  mocks.sendMessage.mockResolvedValue({ ok: true })
})

it('renders and filters demo recordings and launches a new capture', async () => {
  await import('./main')
  expect(await screen.findByRole('heading', { name: 'Recordings' })).toBeInTheDocument()
  expect(screen.getAllByText('Sent to Claude Code')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Mine' }))
  expect(screen.getByText('Empty states pass with the agent')).toBeInTheDocument()
  expect(screen.queryByText('Checkout: pay button barely readable')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'From clients' }))
  expect(screen.getByText('Pricing page review before Friday')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Live sessions' }))
  expect(screen.getByText('Live session')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'record:open' })
})

it('shows local captures in All and Mine but not client filters', async () => {
  mocks.listRecordings.mockResolvedValue([{
    id: 'local', title: 'Local checkout', source: 'tab', status: 'ready', durationMs: 8_000,
    createdAt: '2026-10-24T00:00:00Z', authorName: 'Tomás', marks: [{ id: 'pin', type: 'pin', atMs: 2_000, points: [{ x: 10, y: 10 }], pinNumber: 1 }], transcript: [],
    thumbnailDataUrl: 'data:image/jpeg;base64,eA==',
  }, {
    id: 'plain', title: 'Plain capture', source: 'screen', status: 'ready', durationMs: 1_000,
    createdAt: '2026-10-23T00:00:00Z', authorName: 'Tomás', marks: [], transcript: [],
  }])
  await import('./main')
  expect(await screen.findByText('Local checkout')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mine' }))
  expect(screen.getByText('Local checkout')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'From clients' }))
  expect(screen.queryByText('Local checkout')).toBeNull()
})
