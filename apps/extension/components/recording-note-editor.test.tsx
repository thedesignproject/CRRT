import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordingNoteEditor } from './recording-note-editor'
import type { RecordingMark } from '../lib/recording'
const marks = (): RecordingMark[] => [
  { id: 'long', type: 'text', atMs: 1, points: [{ x: 5, y: 10 }], text: 'x'.repeat(2001) },
  { id: 'pin', type: 'pin', atMs: 2, points: [{ x: 10, y: 10 }] },
  { id: 'short', type: 'text', atMs: 3, points: [{ x: 20, y: 10 }], text: 'Keep this complete note' },
]
it('keeps the original full text until explicit save, preserving the other marks and geometry', async () => {
  const original = marks(), save = vi.fn().mockResolvedValue(undefined)
  render(<RecordingNoteEditor marks={original} save={save} />)
  const field = screen.getByRole('textbox')
  expect(field).toHaveValue('x'.repeat(2001))
  expect(field).toHaveAttribute('maxlength', '2000')
  expect(screen.getByRole('button', { name: 'Save notes and upload' })).toBeDisabled()
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'Rewritten note' } })
  expect(original[0].text).toHaveLength(2001)
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0][0]).toEqual([{ ...original[0], text: 'Rewritten note' }, original[1], original[2]])
  expect(original[0].text).toHaveLength(2001)
})
it('reports persistence failure and lets the user retry the edited note', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined)
  render(<RecordingNoteEditor marks={marks()} save={save} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(2000) } })
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your original recording is still available')
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(save).toHaveBeenCalledTimes(2)
})
it('waits for every oversized note and disables editing during persistence', async () => {
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  render(<RecordingNoteEditor marks={[...marks(), { ...marks()[0], id: 'second' }]} save={save} />)
  const fields = screen.getAllByRole('textbox')
  fireEvent.change(fields[0], { target: { value: 'Shortened' } })
  expect(screen.getByRole('button', { name: 'Save notes and upload' })).toBeDisabled()
  fireEvent.change(fields[1], { target: { value: 'Also shortened' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save notes and upload' }))
  expect(screen.getByRole('button', { name: 'Saving notes…' })).toBeDisabled()
  expect(fields[0]).toBeDisabled()
  finish()
  await screen.findByRole('button', { name: 'Save notes and upload' })
})
