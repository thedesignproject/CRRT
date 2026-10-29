import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordingTitle } from './RecordingTitle'

it('allows owners to cancel editing and rejects an empty title without saving', async () => {
  const rename = vi.fn()
  render(<RecordingTitle title="Capture" rename={rename} />)
  const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
  edit()
  expect(screen.getByRole('textbox')).toHaveValue('Capture')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a recording title.')
  expect(rename).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  edit()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' })
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(screen.getByRole('heading', { name: 'Capture' })).toBeInTheDocument()
})
it('preserves the draft on API failure and prevents cancellation while saving', async () => {
  let reject!: (error: Error) => void
  const rename = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  render(<RecordingTitle title="Capture" rename={rename} />)
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Revised title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  await act(async () => { reject(new Error('Connection lost')) })
  expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
  expect(screen.getByRole('textbox')).toHaveValue('Revised title')
  rename.mockResolvedValueOnce(undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Save title' }))
  await screen.findByRole('heading', { name: 'Capture' })
})
it('does not offer title editing without an owner action', () => {
  render(<RecordingTitle title="Shared capture" />)
  expect(screen.getByRole('heading', { name: 'Shared capture' })).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
})
