import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPreviewServices, WidgetPreview } from './WidgetPreview'

function button(label: string) {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.includes(label))
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('previews provider switching, individual issues, failure, and retry without an API', async () => {
  render(<WidgetPreview />)
  expect(await screen.findByText('Make the product promise clearer in the headline.')).toBeInTheDocument()
  expect(document.body.textContent).toContain('2 of 3 selected')

  fireEvent.click(screen.getByRole('button', { name: 'Choose issue tracker' }))
  expect(document.querySelector('[data-provider-logo="linear"]')).toBeInTheDocument()
  expect(document.querySelector('[data-provider-logo="github"]')).toBeInTheDocument()
  expect(document.querySelector('[data-provider-logo="jira"]')).toBeInTheDocument()
  fireEvent.click(button('GitHub'))
  await act(async () => { fireEvent.click(button('Create 2')) })
  await waitFor(() => expect(document.body.textContent).toContain('1 issue could not be created'))
  expect(document.body.textContent).toContain('Created')
  expect(document.body.textContent).toContain('Failed')

  await act(async () => { fireEvent.click(button('Create 2')) })
  await waitFor(() => expect(document.body.textContent).toContain('1 GitHub issue ready.'))
  await act(async () => { fireEvent.click(button('Create 2')) })
  expect(document.body.textContent).toContain('1 GitHub issue ready.')
})

it('previews feedback mutation, agent handoff, closing, and reset', async () => {
  render(<WidgetPreview />)
  expect(await screen.findByText('Make the product promise clearer in the headline.')).toBeInTheDocument()
  await act(async () => { fireEvent.click(button('Copy for agent')) })
  expect(await screen.findByText('Handoff ready')).toBeInTheDocument()
  await act(async () => { fireEvent.click(button('Codex')) })
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('design rules'))

  fireEvent.click(screen.getByRole('button', { name: 'Close Agent Bridge' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(button('Open widget preview'))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  fireEvent.click(button('Reset preview'))
  expect(await screen.findByText('Make the product promise clearer in the headline.')).toBeInTheDocument()
})

it('keeps the local preview focused on post-approval handoff', async () => {
  render(<WidgetPreview />)
  expect(await screen.findByText('Make the product promise clearer in the headline.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
})

it('keeps the unused upgrade path inert inside the local fixture', async () => {
  const services = createPreviewServices()
  await expect(services.startUpgrade(
    '',
    { projectKey: 'preview-project', pageUrl: 'http://localhost/widget-preview' },
    { accessToken: 'preview-token', displayName: 'Preview', expiresAt: '2099-01-01T00:00:00.000Z' },
  )).resolves.toEqual({ url: '#' })
})
