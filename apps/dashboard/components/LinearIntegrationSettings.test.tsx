import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  disconnectLinear: vi.fn(),
  getLinearIntegration: vi.fn(),
  selectLinearTeam: vi.fn(),
}))

import { disconnectLinear, getLinearIntegration, selectLinearTeam } from '../api'
import { LinearIntegrationSettings } from './LinearIntegrationSettings'

const props = { apiBase: 'https://api.crrt.test', accessToken: 'session', projectKey: 'shop' }
const connected = {
  provider: 'linear' as const,
  connected: true,
  workspace: 'Acme',
  selectedDestinationId: 'team-web',
  destinations: [
    { id: 'team-web', name: 'WEB · Website' },
    { id: 'team-product', name: 'PROD · Product' },
  ],
}

beforeEach(() => {
  vi.mocked(getLinearIntegration).mockReset()
  vi.mocked(selectLinearTeam).mockReset()
  vi.mocked(disconnectLinear).mockReset()
})

afterEach(() => vi.restoreAllMocks())

describe('<LinearIntegrationSettings />', () => {
  it('loads a connection and changes its destination team', async () => {
    vi.mocked(getLinearIntegration).mockResolvedValue(connected)
    vi.mocked(selectLinearTeam).mockResolvedValue({ ...connected, selectedDestinationId: 'team-product' })

    render(<LinearIntegrationSettings {...props} />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Linear team'), { target: { value: 'team-product' } })

    await waitFor(() => expect(selectLinearTeam).toHaveBeenCalledWith(
      props.apiBase, props.accessToken, props.projectKey, 'team-product',
    ))
    expect(screen.getByLabelText('Linear team')).toHaveValue('team-product')
  })

  it('accepts only an origin-bound OAuth result from its popup', async () => {
    vi.mocked(getLinearIntegration)
      .mockResolvedValueOnce({ provider: 'linear', connected: false, destinations: [] })
      .mockResolvedValueOnce({
        provider: 'linear', connected: false, destinations: [],
        authorizeUrl: 'https://linear.app/oauth/authorize?state=signed',
      })
      .mockResolvedValueOnce(connected)
    const popup = { closed: false } as Window
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<LinearIntegrationSettings {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Linear' }))
    await waitFor(() => expect(window.open).toHaveBeenCalledWith(
      'https://linear.app/oauth/authorize?state=signed', 'crrt-linear-connect',
    ))

    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://attacker.test', source: popup,
      data: { type: 'crrt:linear-connect', ok: true, projectKey: 'shop' },
    })))
    expect(screen.queryByText('Acme')).not.toBeInTheDocument()

    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://api.crrt.test', source: popup,
      data: { type: 'crrt:linear-connect', ok: true, projectKey: 'shop' },
    })))
    expect(await screen.findByText('Acme')).toBeInTheDocument()
  })
})
