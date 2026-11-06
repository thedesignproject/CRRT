import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordingTranscript, recordingTime } from './RecordingTranscript'
import type { RecordingPlayback } from '../../../shared/record/client'

const playback = { recording: { state: 'ready' }, stages: [], transcript: [
  { id: 'one', start_ms: 1000, end_ms: 3000, text: 'Open the checkout page.' },
  { id: 'two', start_ms: 4000, end_ms: 6000, text: 'Make the button easier to find.' },
] } as unknown as RecordingPlayback

it('searches timestamped passages, highlights playback, seeks and clears search', () => {
  const seek = vi.fn()
  const view = render(<RecordingTranscript playback={playback} atMs={1500} seek={seek} />)
  expect(screen.getByRole('button', { name: /Open the checkout/ })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('button', { name: /Make the button/ })).not.toHaveAttribute('aria-current')
  fireEvent.click(screen.getByRole('button', { name: /Make the button/ }))
  expect(seek).toHaveBeenCalledWith(4000)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' CHECKOUT ' } })
  expect(screen.queryByRole('button', { name: /Make the button/ })).toBeNull()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } })
  expect(screen.getByText(/No matching transcript/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear transcript search' }))
  expect(screen.getByRole('button', { name: /Make the button/ })).toBeInTheDocument()
  view.rerender(<RecordingTranscript playback={playback} atMs={3000} seek={seek} />)
  expect(screen.getByRole('button', { name: /Open the checkout/ })).not.toHaveAttribute('aria-current')
  expect(recordingTime(125000)).toBe('2:05')
})

it.each([
  ['ready', [], 'No transcript available'],
  ['failed', [], 'No transcript available'],
  ['processing', [{ stage: 'transcription', state: 'running', failure: null }], 'Transcript is on its way'],
  ['ready', [{ stage: 'transcription', state: 'failed', failure: null }], 'Transcription interrupted'],
])('explains an empty transcript for %s recordings', (state, stages, title) => {
  const value = { ...playback, recording: { ...playback.recording, state }, transcript: [], stages } as RecordingPlayback
  render(<RecordingTranscript playback={value} atMs={0} seek={vi.fn()} />)
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  expect(screen.queryByRole('searchbox')).toBeNull()
})
