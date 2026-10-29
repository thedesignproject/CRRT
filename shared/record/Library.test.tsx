import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordingLibrary, type RecordingPage } from './Library'
const row = { id: 'one', title: 'Recording one', state: 'ready', markCount: 1, durationMs: 1500 } as RecordingPage['recordings'][number]
it('lists real recordings, paginates and reports pagination errors', async () => {
  const load = vi.fn().mockResolvedValueOnce({ recordings: [row], next: 'one' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ recordings: [{ ...row, id: 'two', title: 'Video only', durationMs: null }], next: null })
  render(<RecordingLibrary load={load} href={id => `/recording?id=${id}`} />)
  expect(screen.getByText(/Loading recordings/)).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: /Recording one/ })).toHaveAttribute('href', '/recording?id=one')
  fireEvent.click(screen.getByRole('button', { name: 'Load more recordings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  fireEvent.click(screen.getByRole('button', { name: 'Load more recordings' }))
  expect(await screen.findByText('Video only')).toBeInTheDocument()
  expect(load).toHaveBeenCalledWith('one')
})
it('distinguishes an empty library from an unavailable library', async () => {
  const load = vi.fn().mockResolvedValue({ recordings: [], next: null })
  const first = render(<RecordingLibrary load={load} href={id => id} />)
  expect(await screen.findByText(/No uploaded recordings/)).toBeInTheDocument()
  first.unmount()
  load.mockRejectedValue(new Error('Sign in'))
  render(<RecordingLibrary load={load} href={id => id} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in')
  expect(screen.queryByText(/No uploaded recordings/)).toBeNull()
})
it('ignores requests that finish after unmount', async () => {
  let resolve!: (v: unknown) => void
  const load = vi.fn().mockImplementation(() => new Promise(r => { resolve = r }))
  const first = render(<RecordingLibrary load={load} href={id => id} />)
  first.unmount(); await act(async () => { resolve({ recordings: [], next: null }) })
  let reject!: (e: Error) => void
  load.mockImplementation(() => new Promise((_r, j) => { reject = j }))
  const second = render(<RecordingLibrary load={load} href={id => id} />)
  second.unmount(); await act(async () => { reject(new Error('late')) })
})
it('shows a private thumbnail with a readable duration and falls back after an expired image', async () => {
  const load = vi.fn().mockResolvedValue({ recordings: [{ ...row, thumbnailUrl: 'https://private.test/first', durationMs: 65800 }], next: null })
  const view = render(<RecordingLibrary load={load} href={id => `/recording?id=${id}`} />)
  await screen.findByText('Recording one')
  const image = view.container.querySelector('img')!
  expect(image).toHaveAttribute('src', 'https://private.test/first')
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(screen.getByText('1:06')).toBeInTheDocument()
  expect(screen.getByText('1 mark')).toBeInTheDocument()
  expect(screen.getByText('Ready')).toBeInTheDocument()
  fireEvent.error(image)
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
  const refreshed = vi.fn().mockResolvedValue({ recordings: [{ ...row, thumbnailUrl: 'https://private.test/renewed' }], next: null })
  view.rerender(<RecordingLibrary load={refreshed} href={id => id} />)
  await screen.findByText('0:02')
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://private.test/renewed')
})
it('uses honest placeholders for recordings without a derived preview', async () => {
  const states = ['recording', 'uploading', 'processing', 'failed'] as const
  const load = vi.fn().mockResolvedValue({ recordings: states.map(state => ({ ...row, id: state, title: state, state, durationMs: null, markCount: 0 })), next: null })
  const view = render(<RecordingLibrary load={load} href={id => id} />)
  await screen.findByText('Processing failed')
  expect(screen.getAllByText('Preparing preview')).toHaveLength(3)
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument()
  expect(screen.getAllByText('0 marks')).toHaveLength(4)
  expect(view.container.querySelector('.recording-duration')).toBeNull()
})
