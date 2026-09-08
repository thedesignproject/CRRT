import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  disconnectJira: vi.fn(),
  getJiraIntegration: vi.fn(),
  selectJiraProject: vi.fn(),
}))

import { disconnectJira, getJiraIntegration, selectJiraProject } from '../api'
import { JiraIntegrationSettings } from './JiraIntegrationSettings'

const props = { apiBase: 'https://api.crrt.test', accessToken: 'session', projectKey: 'shop' }
const connected = {
  provider: 'jira' as const,
  connected: true,
  workspace: 'Acme Jira',
  selectedDestinationId: 'cloud:web',
  destinations: [
    { id: 'cloud:web', name: 'Acme Jira · WEB · Website' },
    { id: 'cloud:product', name: 'Acme Jira · PROD · Product' },
  ],
}

beforeEach(() => {
  vi.mocked(getJiraIntegration).mockReset()
  vi.mocked(selectJiraProject).mockReset()
  vi.mocked(disconnectJira).mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('<JiraIntegrationSettings />', () => {
  it('loads a connection and changes its destination project', async () => {
    vi.mocked(getJiraIntegration).mockResolvedValue(connected)
    vi.mocked(selectJiraProject).mockResolvedValue({ ...connected, selectedDestinationId: 'cloud:product' })
    render(<JiraIntegrationSettings {...props} />)
    expect(await screen.findByText('Acme Jira')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Jira project'), { target: { value: 'cloud:product' } })
    await waitFor(() => expect(selectJiraProject).toHaveBeenCalledWith(
      props.apiBase, props.accessToken, props.projectKey, 'cloud:product',
    ))
    expect(screen.getByLabelText('Jira project')).toHaveValue('cloud:product')
  })

  it('renders an empty selected project safely', async () => {
    vi.mocked(getJiraIntegration).mockResolvedValue({ ...connected, selectedDestinationId: null })
    render(<JiraIntegrationSettings {...props} />)
    expect(await screen.findByLabelText('Jira project')).toHaveValue('cloud:web')
  })

  it('accepts only an origin-bound OAuth result from Atlassian', async () => {
    vi.mocked(getJiraIntegration)
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [] })
      .mockResolvedValueOnce({
        provider: 'jira', connected: false, destinations: [],
        authorizeUrl: 'https://auth.atlassian.com/authorize?state=signed',
      })
      .mockResolvedValueOnce(connected)
    const popup = { closed: false } as Window
    vi.spyOn(window, 'open').mockReturnValue(popup)
    render(<JiraIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Jira' }))
    await waitFor(() => expect(window.open).toHaveBeenCalledWith(
      'https://auth.atlassian.com/authorize?state=signed', 'crrt-jira-connect',
    ))
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://attacker.test', source: popup,
      data: { type: 'crrt:jira-connect', ok: true, projectKey: 'shop' },
    })))
    expect(screen.queryByText('Acme Jira')).not.toBeInTheDocument()
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://api.crrt.test', source: popup,
      data: { type: 'crrt:jira-connect', ok: true, projectKey: 'shop' },
    })))
    expect(await screen.findByText('Acme Jira')).toBeInTheDocument()
  })

  it('shows safe load, selection, and disconnect failures', async () => {
    vi.mocked(getJiraIntegration).mockRejectedValueOnce(new Error('secret'))
    const view = render(<JiraIntegrationSettings {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load')
    view.unmount()

    vi.mocked(getJiraIntegration).mockResolvedValue(connected)
    vi.mocked(selectJiraProject).mockRejectedValueOnce(new Error('secret'))
    vi.mocked(disconnectJira).mockRejectedValueOnce(new Error('secret'))
    render(<JiraIntegrationSettings {...props} />)
    await screen.findByText('Acme Jira')
    fireEvent.change(screen.getByLabelText('Jira project'), { target: { value: 'cloud:product' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the Jira project.')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not disconnect Jira.')
  })

  it('disconnects and reloads a connected site', async () => {
    vi.mocked(getJiraIntegration)
      .mockResolvedValueOnce(connected)
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [] })
    vi.mocked(disconnectJira).mockResolvedValue()
    render(<JiraIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('button', { name: 'Connect Jira' })).toBeInTheDocument()
  })

  it('rejects invalid authorization URLs and blocked popups', async () => {
    vi.mocked(getJiraIntegration)
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [] })
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [], authorizeUrl: 'https://attacker.test/oauth' })
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [], authorizeUrl: 'https://auth.atlassian.com/authorize' })
    vi.spyOn(window, 'open').mockReturnValue(null)
    render(<JiraIntegrationSettings {...props} />)
    const connect = await screen.findByRole('button', { name: 'Connect Jira' })
    fireEvent.click(connect)
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups')
    fireEvent.click(connect)
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups')
  })

  it('ignores unrelated messages, reports OAuth denial, and notices a closed popup', async () => {
    vi.useFakeTimers()
    vi.mocked(getJiraIntegration)
      .mockResolvedValueOnce({ provider: 'jira', connected: false, destinations: [] })
      .mockResolvedValue({ provider: 'jira', connected: false, destinations: [], authorizeUrl: 'https://auth.atlassian.com/authorize' })
    const popup = { closed: false } as Window
    vi.spyOn(window, 'open').mockReturnValue(popup)
    render(<JiraIntegrationSettings {...props} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Connect Jira' }))
    await act(async () => {})
    for (const data of [
      { type: 'other', ok: false, projectKey: 'shop' },
      { type: 'crrt:jira-connect', ok: false, projectKey: 'other' },
    ]) act(() => window.dispatchEvent(new MessageEvent('message', { origin: props.apiBase, source: popup, data })))
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: props.apiBase, source: window, data: { type: 'crrt:jira-connect', ok: false, projectKey: 'shop' } })))
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: props.apiBase, source: popup, data: { type: 'crrt:jira-connect', ok: false, projectKey: 'shop' } })))
    expect(screen.getByRole('alert')).toHaveTextContent('authorization could not be completed')

    fireEvent.click(screen.getByRole('button', { name: 'Connect Jira' }))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled()
    ;(popup as { closed: boolean }).closed = true
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByRole('button', { name: 'Connect Jira' })).toBeEnabled()
  })
})
