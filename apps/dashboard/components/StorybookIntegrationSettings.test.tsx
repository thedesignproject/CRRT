import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConfig = vi.hoisted(() => ({ enabled: false }))

vi.mock('../api', () => ({
  beginBillingCheckout: vi.fn(),
  createStorybookPairing: vi.fn(),
  getStorybookIntegration: vi.fn(),
}))
vi.mock('../lib/mocks', () => ({
  get mocksEnabled() { return mockConfig.enabled },
}))

import { beginBillingCheckout, createStorybookPairing, getStorybookIntegration } from '../api'
import { StorybookIntegrationSettings } from './StorybookIntegrationSettings'

const props = {
  apiBase: '/api',
  accessToken: 'session',
  projectKey: 'demo',
}

function requestError(message: string, status?: number, code?: string) {
  return Object.assign(new Error(message), { status, code })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockConfig.enabled = false
  vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'not_connected' })
  vi.mocked(createStorybookPairing).mockResolvedValue({
    state: 'waiting',
    command: 'npx @thedesignproject/crrt-storybook connect --code once',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('StorybookIntegrationSettings', () => {
  it('creates and copies a short-lived connection command', async () => {
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Storybook' }))
    expect(await screen.findByText('Run this in your Storybook project')).toBeInTheDocument()
    expect(createStorybookPairing).toHaveBeenCalledWith('/api', 'session', 'demo')

    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'npx @thedesignproject/crrt-storybook connect --code once',
    ))
    expect(await screen.findByText('Command copied.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.getByText(/Requires Storybook 10/)).toBeInTheDocument()
  })

  it('offers manual copying when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    vi.mocked(getStorybookIntegration).mockResolvedValue({
      state: 'waiting',
      command: 'npx connect',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Copy command' }))
    expect(await screen.findByText(/Copy failed/)).toBeInTheDocument()
  })

  it('checks the connection and opens only safe Storybook URLs', async () => {
    vi.mocked(getStorybookIntegration)
      .mockResolvedValueOnce({ state: 'waiting', command: 'npx connect' })
      .mockResolvedValueOnce({ state: 'connected', storybookUrl: 'https://storybook.example.com' })
    const rendered = render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Check connection' }))
    expect(await screen.findByText('Storybook connected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Storybook/ })).toHaveAttribute('href', 'https://storybook.example.com/')

    vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'connected', storybookUrl: 'http://example.com' })
    rendered.rerender(<StorybookIntegrationSettings {...props} projectKey="unsafe" />)
    await screen.findByText('Storybook connected')
    expect(screen.queryByRole('link', { name: /Open Storybook/ })).toBeNull()
  })

  it('allows localhost Storybook and can create a replacement connection', async () => {
    vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'connected', storybookUrl: 'http://127.0.0.1:6008' })
    render(<StorybookIntegrationSettings {...props} />)

    expect(await screen.findByRole('link', { name: /Open Storybook/ })).toHaveAttribute('href', 'http://127.0.0.1:6008/')
    fireEvent.click(screen.getByRole('button', { name: 'Connect a different Storybook' }))
    expect(await screen.findByText('Run this in your Storybook project')).toBeInTheDocument()
  })

  it('hides the open action for malformed Storybook URLs', async () => {
    vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'connected', storybookUrl: 'not a URL' })
    render(<StorybookIntegrationSettings {...props} />)

    expect(await screen.findByText('Storybook connected')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open Storybook/ })).toBeNull()
  })

  it('shows the auth recovery state and retries', async () => {
    vi.mocked(getStorybookIntegration)
      .mockRejectedValueOnce(requestError('Unauthorized', 401))
      .mockResolvedValueOnce({ state: 'not_connected' })
    render(<StorybookIntegrationSettings {...props} />)

    expect(await screen.findByText('Sign in again')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No Storybook connected')).toBeInTheDocument()
  })

  it('routes Pro upgrades through the existing billing checkout', async () => {
    const navigate = vi.fn()
    vi.mocked(getStorybookIntegration).mockRejectedValue(requestError('Payment required', 402))
    vi.mocked(beginBillingCheckout).mockResolvedValue({ url: 'https://checkout.example.com' })
    render(<StorybookIntegrationSettings {...props} navigateToCheckout={navigate} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))
    await waitFor(() => expect(beginBillingCheckout).toHaveBeenCalledWith('/api', 'session'))
    expect(navigate).toHaveBeenCalledWith('https://checkout.example.com')
  })

  it('recovers when billing checkout fails', async () => {
    vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'upgrade_required' })
    vi.mocked(beginBillingCheckout).mockRejectedValue(new Error('Checkout unavailable'))
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout unavailable')
  })

  it('uses the default checkout navigation', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined as never)
    vi.mocked(getStorybookIntegration).mockResolvedValue({ state: 'upgrade_required' })
    vi.mocked(beginBillingCheckout).mockResolvedValue({ url: 'https://checkout.example.com/default' })
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.example.com/default'))
  })

  it('falls back to a useful message for empty request errors', async () => {
    vi.mocked(getStorybookIntegration).mockRejectedValue(new Error(''))
    render(<StorybookIntegrationSettings {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('CRRT could not load the Storybook connection.')
  })

  it('regenerates expired commands and handles pairing errors', async () => {
    vi.mocked(getStorybookIntegration).mockRejectedValue(requestError('Gone', 410))
    vi.mocked(createStorybookPairing).mockRejectedValueOnce(
      requestError('Owner must upgrade', undefined, 'owner_upgrade_required'),
    )
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Generate new command' }))
    expect(await screen.findByText('Storybook is a Pro integration')).toBeInTheDocument()
  })

  it('maps an expired pairing code to a recoverable state', async () => {
    vi.mocked(getStorybookIntegration).mockRejectedValue(
      requestError('Pair expired', undefined, 'pairing_expired'),
    )
    render(<StorybookIntegrationSettings {...props} />)
    expect(await screen.findByText('Connection command expired')).toBeInTheDocument()
  })

  it('expires a command whose deadline has passed', async () => {
    vi.mocked(getStorybookIntegration).mockResolvedValue({
      state: 'waiting',
      command: 'npx old',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })
    render(<StorybookIntegrationSettings {...props} />)
    expect(await screen.findByText('Connection command expired')).toBeInTheDocument()
  })

  it('expires an active command when its deadline arrives', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T18:00:00.000Z'))
    vi.mocked(getStorybookIntegration).mockResolvedValue({
      state: 'waiting',
      command: 'npx current',
      expiresAt: '2026-10-14T18:00:01.000Z',
    })
    render(<StorybookIntegrationSettings {...props} />)
    await act(async () => {})
    expect(screen.getByText('Run this in your Storybook project')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByText('Connection command expired')).toBeInTheDocument()
  })

  it('ignores a stale response after switching projects', async () => {
    let resolveFirst!: (value: { state: 'not_connected' }) => void
    const first = new Promise<{ state: 'not_connected' }>((resolve) => { resolveFirst = resolve })
    vi.mocked(getStorybookIntegration)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ state: 'connected', storybookUrl: 'https://new.example.com' })
    const rendered = render(<StorybookIntegrationSettings {...props} />)

    rendered.rerender(<StorybookIntegrationSettings {...props} projectKey="new" />)
    expect(await screen.findByText('Storybook connected')).toBeInTheDocument()
    await act(async () => resolveFirst({ state: 'not_connected' }))
    expect(screen.queryByText('No Storybook connected')).toBeNull()
  })

  it('renders setup mode and keeps management actions admin-only', async () => {
    const { container } = render(<StorybookIntegrationSettings {...props} appearance="setup" canManage={false} />)
    expect(await screen.findByText('Ask a project admin to connect Storybook.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Storybook' })).toBeNull()
    expect(container.firstElementChild).toHaveClass('rounded-xl')
  })

  it('supports the local demo workflow without a backend', async () => {
    mockConfig.enabled = true
    render(<StorybookIntegrationSettings {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Storybook' }))
    expect(await screen.findByText(/demo-demo/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(await screen.findByRole('link', { name: /Open Storybook/ })).toHaveAttribute('href', 'http://localhost:6008/')
    expect(getStorybookIntegration).not.toHaveBeenCalled()
  })
})
