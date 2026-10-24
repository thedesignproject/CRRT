import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RecordingsPage } from './RecordingsPage'

afterEach(() => vi.restoreAllMocks())

it('filters the demo library and explains how the extension launches Record', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<RecordingsPage />)
  expect(screen.getByRole('heading', { name: 'Recordings' })).toBeInTheDocument()
  expect(screen.getAllByText('Sent to Claude Code')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Mine' }))
  expect(screen.getByRole('button', { name: 'Mine' })).toHaveClass('active')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.queryByText('Checkout: pay button barely readable')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'From clients' }))
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByText('Checkout: pay button barely readable')).toBeInTheDocument()
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
  render(<RecordingsPage />)
  const open = () => fireEvent.click(screen.getByRole('button', { name: /New recording/ }))
  open(); fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(screen.queryByRole('dialog')).toBeNull()
  open(); fireEvent.mouseDown(screen.getByRole('presentation')); expect(screen.queryByRole('dialog')).toBeNull()
})
