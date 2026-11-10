import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RecordingsPage } from './RecordingsPage'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ recordings: [], next: null }))))

it('opens uploaded recordings and passes the owner cursor when loading another page', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ recordings: [{ id: 'one', title: 'Stored capture', state: 'ready', markCount: 0 }], next: 'one' })).mockResolvedValueOnce(Response.json({ recordings: [], next: null }))
  render(<RecordingsPage apiBase="/api" accessToken="owner" />)
  expect(await screen.findByRole('link', { name: /Stored capture/ })).toHaveAttribute('href', '/recording?id=one')
  expect(screen.getByRole('button', { name: 'Share Stored capture' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load more recordings' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/recordings?before=one', expect.anything()))
})

it('filters the demo library and explains how the extension launches Record', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<RecordingsPage apiBase="/api" accessToken="token" />)
  expect(screen.getByRole('heading', { name: 'Recordings' })).toBeInTheDocument()
  expect(screen.queryByText('Checkout: pay button barely readable')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  expect(screen.getByRole('dialog', { name: 'Open CRRT Record' })).toBeInTheDocument()
  expect(screen.getByText(/recorder runs in the Chrome extension/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy shortcut' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('⌥⇧R'))
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('dismisses the launcher from the close button and backdrop', () => {
  render(<RecordingsPage apiBase="/api" accessToken="token" />)
  const open = () => fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  open(); fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(screen.queryByRole('dialog')).toBeNull()
  open(); fireEvent.mouseDown(screen.getByRole('dialog')); expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  open(); fireEvent.mouseDown(screen.getByRole('presentation')); expect(screen.queryByRole('dialog')).toBeNull()
})
