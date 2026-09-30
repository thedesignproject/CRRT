import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../lib/widgetLogin', async (original) => ({ ...await original<any>(), startWidgetLogin: vi.fn() }))
vi.mock('../lib/screenshotCapture', () => ({ useScreenshotCapture: () => ({ image: null, previewUrl: null, status: 'idle', capture: vi.fn(), clear: vi.fn(), toBase64: async () => null }) }))
import { startWidgetLogin } from '../lib/widgetLogin'
import { FeedbackWidget } from '../components/FeedbackWidget'
const session = { accessToken: `crrt_widget_${'a'.repeat(43)}`, displayName: 'Ada', expiresAt: '2099-01-01' }
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), clear: () => storage.clear() })
  vi.mocked(startWidgetLogin).mockResolvedValue(session)
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? { id: 'c', authorName: 'Ada' } : []))))
})
afterEach(() => { vi.unstubAllGlobals(); document.querySelectorAll('[data-login-target]').forEach((node) => node.remove()) })
async function selectTarget() {
  const target = document.createElement('article'); target.dataset.loginTarget = ''; document.body.appendChild(target)
  await act(async () => { fireEvent.keyDown(window, { key: 'c' }) })
  await act(async () => { fireEvent.click(target, { clientX: 60, clientY: 60 }) })
}
it('offers guest/login, resumes the composer after handoff, submits with the limited token, and signs out', async () => {
  render(<FeedbackWidget projectId="p" />); await selectTarget()
  expect(screen.getByText('Continue as guest')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByText('Log in to CRRT')) })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const textarea = document.querySelector('textarea')!
  expect(textarea).not.toBeNull()
  fireEvent.change(textarea, { target: { value: 'Please fix this' } })
  await act(async () => { fireEvent.click(screen.getByLabelText('Send')) })
  expect(fetch).toHaveBeenCalledWith('https://crrt.ai/api/v1/public/comments', expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${session.accessToken}` }) }))
  // Selecting is resumed after submission.
  const target = document.querySelector('[data-login-target]')!
  await act(async () => { fireEvent.click(target) })
  await act(async () => { fireEvent.click(screen.getByTitle('Signed in as Ada')) })
  await act(async () => { fireEvent.click(screen.getByText('Sign out of this widget')) })
  expect(screen.getByText('Log in to CRRT')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('https://crrt.ai/api/v1/widget/auth/exchange', expect.objectContaining({ method: 'DELETE' }))
})
it('keeps a draft when sign-in fails and allows guest continuation', async () => {
  vi.mocked(startWidgetLogin).mockRejectedValueOnce(new Error('Allow popups'))
  render(<FeedbackWidget projectId="p" />); await selectTarget()
  await act(async () => { fireEvent.click(screen.getByText('Log in to CRRT')) })
  expect(screen.getByRole('alert')).toHaveTextContent('Allow popups')
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Guest' } })
  await act(async () => { fireEvent.click(screen.getByText('Continue as guest')) })
  expect(document.querySelector('textarea')).not.toBeNull()
  expect(window.localStorage.getItem('fw-crrt-author-name')).toBe('Guest')
})
it('resumes a pending send after login instead of dropping the draft', async () => {
  window.localStorage.setItem('fw-crrt-author-name', 'Guest')
  const { rerender } = render(<FeedbackWidget projectId="p" />); await selectTarget()
  fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Draft survives login' } })
  // Moving from the supplied account adapter back to npm clears unpersisted identity.
  window.localStorage.clear()
  const adapter = { list: async () => [], create: vi.fn(), update: vi.fn(), remove: vi.fn() }
  rerender(<FeedbackWidget projectId="p" personalComments={adapter} viewerEmail="extension" />)
  rerender(<FeedbackWidget projectId="p" />)
  await act(async () => { fireEvent.click(screen.getByLabelText('Send')) })
  expect(screen.getByText('Log in to CRRT')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByText('Log in to CRRT')) })
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('https://crrt.ai/api/v1/public/comments', expect.objectContaining({ body: expect.stringContaining('Draft survives login') })))
})

it('can finish login after leaving selection without opening an empty composer', async () => {
  let finish!: (value: typeof session) => void
  vi.mocked(startWidgetLogin).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  render(<FeedbackWidget projectId="p" />); await selectTarget()
  act(() => { fireEvent.click(screen.getByText('Log in to CRRT')) })
  await act(async () => { fireEvent.keyDown(window, { key: 'c' }) })
  await act(async () => finish(session))
  expect(document.querySelector('textarea')).toBeNull()
})
