import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessage = vi.fn()
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }))
const listExtensionProjects = vi.hoisted(() => vi.fn())
const getActiveProject = vi.hoisted(() => vi.fn())
const setActiveProject = vi.hoisted(() => vi.fn())
vi.mock('../lib/comments-api', () => ({ listExtensionProjects }))
vi.mock('../lib/project-context', () => ({ getActiveProject, setActiveProject }))

document.body.innerHTML = '<div id="root"></div>'
const { Popup } = await import('../entrypoints/popup/main')

beforeEach(() => {
  sendMessage.mockReset()
  listExtensionProjects.mockReset().mockResolvedValue([])
  getActiveProject.mockReset().mockResolvedValue(null)
  setActiveProject.mockReset().mockResolvedValue(undefined)
  document.body.innerHTML = ''
  vi.stubEnv('WXT_DASHBOARD_URL', 'http://127.0.0.1:5173/dashboard/')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('extension popup', () => {
  it('signs in, activates commenting, and signs out', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, data: null })
    const { unmount } = render(<Popup />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await screen.findByText('Sign in to CRRT')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'u@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('name', 'password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute('rel', 'noopener noreferrer')
    sendMessage.mockResolvedValueOnce({ ok: true, data: { email: 'u@example.com', accessToken: 't' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    await screen.findByText('Signed in as u@example.com')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', 'http://127.0.0.1:5173/dashboard/?view=extension-comments')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('rel', 'noopener noreferrer')

    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    sendMessage.mockResolvedValueOnce({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: 'Start commenting' }))
    await waitFor(() => expect(close).toHaveBeenCalled())

    sendMessage.mockResolvedValueOnce({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByText('Sign in to CRRT')
    unmount()
  })

  it('shows load and action errors including malformed background responses', async () => {
    sendMessage.mockRejectedValueOnce(new Error('load failed'))
    let view = render(<Popup />)
    await screen.findByRole('alert'); expect(screen.getByText('load failed')).toBeInTheDocument(); view.unmount()

    sendMessage.mockRejectedValueOnce('load failed')
    view = render(<Popup />)
    await screen.findByRole('alert'); expect(screen.getByText('Could not load CRRT')).toBeInTheDocument(); view.unmount()

    sendMessage.mockResolvedValueOnce({ ok: true, data: null })
    view = render(<Popup />); await screen.findByText('Sign in to CRRT')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'u@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    sendMessage.mockResolvedValueOnce({ ok: false, error: 'wrong password' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); await screen.findByText('wrong password')
    sendMessage.mockRejectedValueOnce('bad')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); await screen.findByText('Sign in failed'); view.unmount()

    sendMessage.mockResolvedValueOnce({ ok: true, data: { email: 'u@example.com', accessToken: 't' } })
    view = render(<Popup />); await screen.findByText('Signed in as u@example.com')
    sendMessage.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Start commenting' })); await screen.findByText('Extension background is unavailable')
    sendMessage.mockRejectedValueOnce('bad')
    fireEvent.click(screen.getByRole('button', { name: 'Start commenting' })); await screen.findByText('Could not start commenting')
    sendMessage.mockRejectedValueOnce(new Error('logout down'))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByText('logout down')
    sendMessage.mockRejectedValueOnce('bad')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByText('Sign out failed'); view.unmount()
  })

  it('selects a project or private feedback destination', async () => {
    const projects = [
      { publicKey: 'p1', name: 'Storefront', allowedOrigins: ['store.example.com'] },
      { publicKey: 'p2', name: 'Dashboard', allowedOrigins: [] },
    ]
    sendMessage.mockResolvedValueOnce({ ok: true, data: { email: 'u@example.com', accessToken: 't' } })
    listExtensionProjects.mockResolvedValueOnce(projects)
    getActiveProject.mockResolvedValueOnce({ publicKey: 'p1', name: 'Storefront' })
    const view = render(<Popup />)
    const destination = await screen.findByRole('combobox', { name: 'Feedback destination' })
    expect(destination).toHaveValue('p1')

    fireEvent.change(destination, { target: { value: 'p2' } })
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledWith({ publicKey: 'p2', name: 'Dashboard' }))
    expect(destination).toHaveValue('p2')

    fireEvent.change(destination, { target: { value: '' } })
    await waitFor(() => expect(setActiveProject).toHaveBeenCalledWith(null))
    expect(destination).toHaveValue('')
    view.unmount()
  })

  it('reports project selection failures without changing the destination', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, data: { email: 'u@example.com', accessToken: 't' } })
    listExtensionProjects.mockResolvedValueOnce([{ publicKey: 'p1', name: 'Storefront', allowedOrigins: [] }])
    const view = render(<Popup />)
    const destination = await screen.findByRole('combobox', { name: 'Feedback destination' })

    setActiveProject.mockRejectedValueOnce(new Error('storage unavailable'))
    fireEvent.change(destination, { target: { value: 'p1' } })
    await screen.findByText('storage unavailable')
    expect(destination).toHaveValue('')

    setActiveProject.mockRejectedValueOnce('offline')
    fireEvent.change(destination, { target: { value: 'p1' } })
    await screen.findByText('Could not save feedback destination')
    expect(destination).toHaveValue('')
    view.unmount()
  })

  it('clears a stale project selection that is no longer accessible', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, data: { email: 'u@example.com', accessToken: 't' } })
    listExtensionProjects.mockResolvedValueOnce([])
    getActiveProject.mockResolvedValueOnce({ publicKey: 'gone', name: 'Gone' })
    const view = render(<Popup />)
    await screen.findByRole('combobox', { name: 'Feedback destination' })
    expect(setActiveProject).toHaveBeenCalledWith(null)
    view.unmount()
  })
})
