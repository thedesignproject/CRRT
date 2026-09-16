import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createExtensionAuthHandoff = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ createExtensionAuthHandoff }))
vi.mock('./LoginPage', () => ({ LoginPage: (props: unknown) => <div data-testid="login">{JSON.stringify(props)}</div> }))

import { ExtensionAuthPage } from './ExtensionAuthPage'

const redirectUri = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/crrt-auth'
function search(char = 'a', intent = 'signin') {
  return `?${new URLSearchParams({ state: char.repeat(43), code_challenge: 'p'.repeat(43), redirect_uri: redirectUri, intent })}`
}

beforeEach(() => {
  createExtensionAuthHandoff.mockReset()
  window.history.replaceState({}, '', `/dashboard/extension-auth${search()}`)
})

describe('ExtensionAuthPage', () => {
  it('keeps the hosted flow on the same route while the user signs up', () => {
    window.history.replaceState({}, '', `/dashboard/extension-auth${search('b', 'signup')}`)
    render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken={null} />)
    expect(screen.getByTestId('login')).toHaveTextContent('"initialMode":"signup"')
    expect(screen.getByTestId('login')).toHaveTextContent('/dashboard/extension-auth')
  })

  it('rejects malformed launch parameters before authentication', () => {
    window.history.replaceState({}, '', '/dashboard/extension-auth?state=bad')
    render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken={null} />)
    expect(screen.getByRole('heading', { name: 'This sign-in link is invalid' })).toBeInTheDocument()
    expect(createExtensionAuthHandoff).not.toHaveBeenCalled()
  })

  it('does not request a handoff for malformed authenticated launches', () => {
    window.history.replaceState({}, '', '/dashboard/extension-auth?state=bad')
    render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" />)
    expect(screen.getByRole('heading', { name: 'This sign-in link is invalid' })).toBeInTheDocument()
    expect(createExtensionAuthHandoff).not.toHaveBeenCalled()
  })

  it('creates one handoff under strict rendering and returns to Chrome', async () => {
    const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
    createExtensionAuthHandoff.mockResolvedValue({ redirectUrl: `${redirectUri}?code=${'c'.repeat(43)}&state=${'a'.repeat(43)}` })
    render(<StrictMode><ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" /></StrictMode>)
    expect(screen.getByLabelText('Connecting')).toBeInTheDocument()
    await waitFor(() => expect(replace).toHaveBeenCalledOnce())
    expect(createExtensionAuthHandoff).toHaveBeenCalledOnce()
    expect(createExtensionAuthHandoff).toHaveBeenCalledWith('https://crrt.ai/api', 'access', expect.objectContaining({ redirectUri }))
  })

  it('shows specific and fallback handoff failures', async () => {
    window.history.replaceState({}, '', `/dashboard/extension-auth${search('d')}`)
    createExtensionAuthHandoff.mockRejectedValueOnce(new Error('Extension is not allowed'))
    let view = render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" />)
    expect(await screen.findByText('Extension is not allowed')).toBeInTheDocument()
    view.unmount()

    window.history.replaceState({}, '', `/dashboard/extension-auth${search('e')}`)
    createExtensionAuthHandoff.mockRejectedValueOnce('offline')
    view = render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" />)
    expect(await screen.findByText('Could not connect the extension')).toBeInTheDocument()
    view.unmount()
  })

  it('rejects an invalid server callback and ignores failures after unmount', async () => {
    window.history.replaceState({}, '', `/dashboard/extension-auth${search('f')}`)
    createExtensionAuthHandoff.mockResolvedValueOnce({ redirectUrl: 'https://evil.example/callback' })
    let view = render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" />)
    expect(await screen.findByText('CRRT returned an invalid extension callback')).toBeInTheDocument()
    view.unmount()

    window.history.replaceState({}, '', `/dashboard/extension-auth${search('g')}`)
    let reject!: (cause: unknown) => void
    createExtensionAuthHandoff.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    view = render(<ExtensionAuthPage apiBase="https://crrt.ai/api" accessToken="access" />)
    view.unmount()
    reject(new Error('late failure'))
    await Promise.resolve()
    expect(screen.queryByText('late failure')).not.toBeInTheDocument()
  })
})
