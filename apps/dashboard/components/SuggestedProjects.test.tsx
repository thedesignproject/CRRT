import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SuggestedProjects } from './SuggestedProjects'
import { domainAccessApi } from '../domain-access-api'
vi.mock('../domain-access-api', () => ({ domainAccessApi: vi.fn() }))
const api = { suggestions: vi.fn(), submit: vi.fn() }
const changed = vi.fn()
const project = { project_key: 'p', name: 'Company app', domain: 'company.com', status: null, retry_at: null }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(domainAccessApi).mockReturnValue(api as never)
  api.suggestions.mockResolvedValue([project]); api.submit.mockResolvedValue({})
})
const view = () => render(<SuggestedProjects apiBase="/api" accessToken="token" onProjectsChanged={changed} />)
it('requests access, shows pending approval and refreshes membership state', async () => {
  view()
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  const button = await screen.findByRole('button', { name: 'Request access to Company app' })
  api.suggestions.mockResolvedValue([{ ...project, status: 'pending' }])
  fireEvent.click(button)
  expect(await screen.findByText('Pending approval')).toBeInTheDocument()
  expect(api.submit).toHaveBeenCalledWith('p')
  expect(changed).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: /Request access to/ })).toBeNull()
})
it('explains cooldown and allows retries only after the server timestamp', async () => {
  api.suggestions.mockResolvedValue([
    { ...project, status: 'declined', retry_at: '2999-01-01T00:00:00Z' },
    { ...project, project_key: 'expired', name: 'Expired', status: 'declined', retry_at: '2000-01-01T00:00:00Z' },
    { ...project, project_key: 'missing', name: 'Missing date', status: 'declined' },
  ])
  view()
  expect(await screen.findByText(/Declined. Request again after/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request access to Expired' })).toHaveTextContent('Request again')
  expect(screen.queryByRole('button', { name: 'Request access to Company app' })).toBeNull()
})
it('shows empty suggestions and refreshes on demand and window focus', async () => {
  api.suggestions.mockResolvedValue([])
  view()
  expect(await screen.findByText(/No suggested projects/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
  await waitFor(() => expect(api.suggestions).toHaveBeenCalledTimes(2))
  expect(changed).toHaveBeenCalledTimes(1)
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(api.suggestions).toHaveBeenCalledTimes(3))
})
it('shows eligibility and loading failures without reporting success', async () => {
  api.suggestions.mockRejectedValueOnce(new Error('Offline'))
  view()
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
  const button = await screen.findByRole('button', { name: 'Request access to Company app' })
  expect(changed).toHaveBeenCalledTimes(1)
  changed.mockClear()
  api.submit.mockRejectedValueOnce(new Error('Domain removed'))
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Domain removed')
  expect(changed).not.toHaveBeenCalled()
})

it('refreshes memberships when an approved request disappears from suggestions', async () => {
  api.suggestions.mockResolvedValue([{ ...project, status: 'pending' }])
  view()
  await screen.findByText('Pending approval')
  api.suggestions.mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
  expect(await screen.findByText(/No suggested projects/)).toBeInTheDocument()
  expect(changed).toHaveBeenCalledTimes(1)
})
