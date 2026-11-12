import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn(), send: vi.fn(), render: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage: mocks.send } } }))
vi.mock('../../lib/recording-permissions', () => ({ requestRecordingPermissions: mocks.request }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: mocks.render }) }))
import { RecordingPermissions } from './main'

beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', '/?session=session-1&camera=1&microphone=1')
  mocks.request.mockResolvedValue(undefined)
  mocks.send.mockResolvedValue({ ok: true })
  vi.spyOn(window, 'close').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('waits for an explicit click, grants only selected devices, then resumes the session', async () => {
  render(<RecordingPermissions />)
  expect(mocks.request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Allow access and continue' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Recording in progress' })).toBeInTheDocument())
  expect(mocks.request).toHaveBeenCalledWith({ cameraEnabled: true, microphoneEnabled: true })
  expect(mocks.send).toHaveBeenCalledWith({ type: 'record:permissions-ready', sessionId: 'session-1' })
})

it('keeps the window open after denial and lets the user retry', async () => {
  history.replaceState(null, '', '/?session=session-1&microphone=1')
  mocks.request.mockRejectedValueOnce(new Error('NotAllowedError'))
  render(<RecordingPermissions />)
  fireEvent.click(screen.getByRole('button'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Allow access in Chrome and your system settings')
  expect(window.close).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledWith({ cameraEnabled: false, microphoneEnabled: true })
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Recording in progress' })).toBeInTheDocument())
})

it.each([undefined, { ok: false }, { ok: false, error: 'Session expired' }])('does not close or claim success when the session cannot resume: %j', async (response) => {
  mocks.send.mockResolvedValueOnce(response)
  render(<RecordingPermissions />)
  fireEvent.click(screen.getByRole('button'))
  await screen.findByRole('alert')
  expect(window.close).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toBeEnabled()
})

it('keeps the permission window alive until capture acquisition is acknowledged', async () => {
  let acknowledge!: (value: unknown) => void
  mocks.send.mockReturnValueOnce(new Promise((resolve) => { acknowledge = resolve }))
  render(<RecordingPermissions />)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(mocks.send).toHaveBeenCalled())
  expect(window.close).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Starting recording…' })).toBeDisabled()
  acknowledge({ ok: true })
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Recording in progress' })).toBeInTheDocument())
})
