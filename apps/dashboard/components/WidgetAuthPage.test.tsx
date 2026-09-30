import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('./LoginPage', () => ({ LoginPage: ({ continuationPath }: { continuationPath: string }) => <div>Login {continuationPath}</div> }))
import { WidgetAuthPage } from './WidgetAuthPage'
const proof = 'a'.repeat(43)
const query = new URLSearchParams({ projectKey: 'p', origin: 'https://site.test', state: proof, codeChallenge: proof }).toString()
const opener = { postMessage: vi.fn() }
beforeEach(() => {
  window.history.replaceState({}, '', `/widget-auth?${query}`)
  Object.defineProperty(window, 'opener', { configurable: true, value: opener })
  opener.postMessage.mockClear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: proof, state: proof }))))
})
afterEach(() => vi.unstubAllGlobals())
it('requires a valid request and an opener', () => {
  const { rerender } = render(<WidgetAuthPage apiBase="api" accessToken={null} />)
  expect(screen.getByText(/Login/)).toHaveTextContent(`/widget-auth?${query}`)
  Object.defineProperty(window, 'opener', { value: null }); rerender(<WidgetAuthPage apiBase="api" accessToken="token" />)
  expect(screen.getByText(/Return to the website/)).toBeInTheDocument()
  window.history.replaceState({}, '', '/widget-auth'); rerender(<WidgetAuthPage apiBase="api" accessToken="other" />)
  expect(fetch).not.toHaveBeenCalled()
})
it('automatically reuses the dashboard session and sends only the handoff to the exact opener origin', async () => {
  render(<WidgetAuthPage apiBase="api" accessToken="dashboard-session" />)
  await waitFor(() => expect(opener.postMessage).toHaveBeenCalledWith({ type: 'crrt:widget-auth', code: proof, state: proof }, 'https://site.test'))
  expect(fetch).toHaveBeenCalledWith('api/v1/widget/auth/handoff', expect.objectContaining({ headers: { Authorization: 'Bearer dashboard-session', 'Content-Type': 'application/json' } }))
  expect(screen.getByRole('status')).toHaveTextContent('Connected')
})
it.each([[400, { code: proof, state: proof }], [200, { code: 'bad', state: proof }], [200, { code: proof, state: 'wrong' }]])('handles rejected handoffs %#', async (status, body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }))
  render(<WidgetAuthPage apiBase="api" accessToken="token" />)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not connect'))
  expect(opener.postMessage).not.toHaveBeenCalled()
})
it.each([true, false])('ignores responses after unmount %#', async (success) => {
  let finish!: (value: Response) => void
  vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const { unmount } = render(<WidgetAuthPage apiBase="api" accessToken="token" />)
  unmount(); await act(async () => finish(new Response(JSON.stringify({ code: success ? proof : 'bad', state: proof }))))
  expect(opener.postMessage).not.toHaveBeenCalled()
})
