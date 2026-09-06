import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  disconnectJira: vi.fn(),
  getJiraIntegration: vi.fn(),
  selectJiraProject: vi.fn(),
}))

import { getJiraIntegration, selectJiraProject } from '../api'
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
})
afterEach(() => vi.restoreAllMocks())

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
})
