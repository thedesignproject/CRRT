import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordingRecovery, recordingAfterRetry } from './Recovery'
import type { RecordingPlayback } from './client'

const job = (stage: string, state = 'failed', retryable = true) => ({ stage, state, failure: { stage, code: 'temporary', retryable } })

it('lets automatic retries finish before offering manual recovery', () => {
  const retry = vi.fn()
  render(<RecordingRecovery stages={[job('metadata', 'pending'), job('transcription', 'running'), job('alignment', 'pending'), job('cleanup'), job('metadata', 'done'), { ...job('transcription', 'pending'), failure: null }]} retry={retry} />)
  expect(screen.getAllByRole('status')).toHaveLength(3)
  expect(screen.queryByRole('button')).toBeNull()
  expect(retry).not.toHaveBeenCalled()
})

it('offers separate stage retries, blocks duplicate clicks and retains failures for retry', async () => {
  let resolve!: () => void
  const retry = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
  render(<RecordingRecovery stages={[job('metadata'), job('transcription'), job('alignment')]} retry={retry} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  fireEvent.click(screen.getByRole('button', { name: 'Retry transcription' }))
  expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Retry key moments' })).toBeDisabled()
  await act(async () => resolve())
  expect(retry).toHaveBeenLastCalledWith('transcription')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('does not expose recovery to public viewers or for terminal failures', () => {
  const view = render(<RecordingRecovery stages={[job('metadata')]} />)
  expect(screen.getByText('We couldn’t prepare your video.')).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
  view.rerender(<RecordingRecovery stages={[job('metadata', 'failed', false), { ...job('transcription'), failure: null }]} retry={vi.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('queues only the selected stage while retaining playable video and other failures', () => {
  const playback = { recording: { state: 'failed' }, stages: [job('metadata'), job('transcription'), { ...job('alignment', 'pending'), failure: null }], artifacts: [{ kind: 'screen', url: 'signed' }], transcript: [] } as unknown as RecordingPlayback
  const next = recordingAfterRetry(playback, 'transcription')!
  expect(next.artifacts).toBe(playback.artifacts)
  expect(next.recording).toMatchObject({ state: 'failed', failure: job('metadata').failure })
  expect(next.stages[1]).toMatchObject({ state: 'pending', failure: null })
  expect(recordingAfterRetry(next, 'metadata')!.recording).toMatchObject({ state: 'processing', failure: null })
  expect(recordingAfterRetry(undefined, 'metadata')).toBeUndefined()
})
