import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceComposer, VoicePlayer, formatDuration, type Clip } from './VoiceCommentPrototype'
import type { PrototypeComposerContext } from '../../../src/components/FeedbackWidget/types'
import { startRecording, type RecordingSample } from './recording'
import { startTranscription } from './transcription'
vi.mock('./recording', async importOriginal => ({ ...await importOriginal<typeof import('./recording')>(), startRecording: vi.fn() }))
vi.mock('./transcription', () => ({ startTranscription: vi.fn() }))
const start = vi.mocked(startRecording)
let sample: (value: RecordingSample) => void
let failed: () => void
let signal: AbortSignal
let finish: ReturnType<typeof vi.fn<() => Promise<Blob>>>
let context: PrototypeComposerContext
let submit: ReturnType<typeof vi.fn<(note: string, clip: Clip | null) => Promise<boolean>>>
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const transcript = { text: 'Make the heading shorter, please.', status: 'ready' as const, reason: '' }
const audioClip: Clip = { url: 'blob:test', seconds: 12, levels: [.1, .7], transcript }
function composer() { return render(<VoiceComposer context={context} onSubmit={submit} />) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:recording'), revokeObjectURL: vi.fn() }))
  finish = vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }))
  start.mockImplementation(async (s, cb, fail) => { signal = s; sample = cb; failed = fail; return { finish, discard: vi.fn() } })
  vi.mocked(startTranscription).mockReturnValue({ finish: async () => transcript })
  context = { target: { url: 'https://example.test/pricing', selector: '#pricing', x: 10, y: 20 },
    imagePreviewUrl: 'blob:screenshot', screenshotStatus: 'ready', removeScreenshot: vi.fn(), cancel: vi.fn(), submit: vi.fn() }
  submit = vi.fn().mockResolvedValue(true)
})
afterEach(() => vi.unstubAllGlobals())
async function record() {
  click('Record voice note')
  await screen.findByText('Recording', { exact: true })
  act(() => sample({ seconds: 12, levels: [.2, .9] }))
}
async function attach() { await record(); click('Attach voice note'); await screen.findByText('Voice note') }

describe('composer', () => {
  it('uses the selected target screenshot and supports text-only submission', async () => {
    composer()
    expect(screen.getByText('/pricing')).toBeVisible()
    expect(screen.getByAltText('Selected element screenshot')).toHaveAttribute('src', 'blob:screenshot')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Shorten this label' } })
    click('Remove screenshot')
    expect(context.removeScreenshot).toHaveBeenCalledOnce()
    click('Send')
    await waitFor(() => expect(submit).toHaveBeenCalledWith('Shorten this label', null))
  })
  it('checks a recording into the draft without posting and transfers audio ownership when sent', async () => {
    const view = composer()
    await record()
    expect(screen.getByRole('button', { name: 'Microphone is recording' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    click('Attach voice note')
    await screen.findByText('Voice note')
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText('00:12')).toBeVisible()
    click('Send')
    await waitFor(() => expect(submit).toHaveBeenCalledWith('', expect.objectContaining({ transcript, url: 'blob:recording' })))
    view.unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(signal.aborted).toBe(true)
  })
  it('removes a take and discards a new recording without losing typed feedback', async () => {
    composer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this note' } })
    await attach()
    click('Remove voice note')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording')
    await record()
    click('Discard recording')
    expect(signal.aborted).toBe(true)
    expect(screen.getByRole('textbox')).toHaveValue('Keep this note')
  })
  it('cancels an empty composer via the widget context', () => { composer(); click('Cancel'); expect(context.cancel).toHaveBeenCalledOnce() })
  it('confirms cancelling typed feedback and allows keeping it', () => {
    composer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this' } })
    click('Cancel'); click('Keep editing')
    expect(screen.getByRole('textbox')).toHaveValue('Keep this')
    click('Cancel'); click('Discard')
    expect(context.cancel).toHaveBeenCalledOnce()
  })
  it('confirms cancelling audio-only drafts and revokes unsent recordings on unmount', async () => {
    const view = composer()
    await attach(); click('Cancel'); click('Discard'); view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording')
  })
  it('confirms cancelling an active recording', async () => {
    const view = composer()
    await record(); click('Cancel'); click('Discard'); view.unmount()
    expect(signal.aborted).toBe(true)
  })
  it('handles permission denial and retries without losing the note', async () => {
    start.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    composer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My note' } })
    click('Record voice note')
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was blocked')
    expect(screen.getByRole('textbox')).toHaveValue('My note')
    await record()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it.each(['resolve', 'reject'])('ignores late permission %s after cancellation', async outcome => {
    let resolve!: (value: Awaited<ReturnType<typeof startRecording>>) => void
    let reject!: (reason: Error) => void
    start.mockImplementationOnce(s => { signal = s; return new Promise((yes, no) => { resolve = yes; reject = no }) })
    composer(); click('Record voice note'); click('Cancel request')
    await act(async () => outcome === 'resolve' ? resolve({ finish, discard: vi.fn() }) : reject(new Error('cancelled')))
    expect(signal.aborted).toBe(true)
    expect(screen.queryByText('Recording', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('recovers when the microphone disconnects', async () => {
    composer(); await record(); act(() => failed())
    expect(screen.getByRole('alert')).toHaveTextContent('microphone disconnected')
  })
  it('handles empty recordings and retries', async () => {
    finish.mockRejectedValueOnce(new Error('No audio was captured.'))
    composer(); await record(); click('Attach voice note')
    expect(await screen.findByRole('alert')).toHaveTextContent('No audio was captured')
    await attach()
  })
  it.each(['resolve', 'reject'])('ignores late encoding %s after discarding', async outcome => {
    let resolve!: (value: Blob) => void
    let reject!: (reason: Error) => void
    finish.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no }))
    composer(); await record(); click('Attach voice note')
    expect(screen.getByText('Preparing voice note…')).toBeVisible()
    click('Discard recording')
    await act(async () => outcome === 'resolve' ? resolve(new Blob(['audio'])) : reject(new Error('cancelled')))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('automatically attaches the take at two minutes', async () => {
    composer(); await record(); act(() => sample({ seconds: 120, levels: [.8, .1] }))
    await screen.findByText('Voice note')
    expect(finish).toHaveBeenCalledOnce()
    expect(screen.getByText('02:00')).toBeVisible()
  })
  it('preserves an audio draft when submission fails', async () => {
    submit.mockResolvedValueOnce(false)
    const view = composer(); await attach(); click('Send')
    expect(await screen.findByRole('alert')).toHaveTextContent('draft is still here')
    expect(screen.getByRole('button', { name: 'Play voice note' })).toBeVisible()
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('preserves text when submission fails and supports Cmd+Enter', async () => {
    submit.mockResolvedValueOnce(false)
    composer()
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(submit).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'My feedback' } })
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('draft is still here')
    expect(screen.getByRole('textbox')).toHaveValue('My feedback')
  })
  it('prevents duplicate keyboard submissions and waits for screenshot capture', async () => {
    submit.mockImplementation(() => new Promise(() => {}))
    context.screenshotStatus = 'capturing'; context.imagePreviewUrl = null
    const view = composer()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'A note' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(submit).not.toHaveBeenCalled()
    context.screenshotStatus = 'ready'
    view.rerender(<VoiceComposer context={context} onSubmit={submit} />)
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(submit).toHaveBeenCalledOnce()
  })
  it('prevents sending while recording and reports failed screenshots', async () => {
    context.screenshotStatus = 'failed'; context.imagePreviewUrl = null
    composer(); expect(screen.getByText('Screenshot unavailable')).toBeVisible()
    await record()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(submit).not.toHaveBeenCalled()
  })
  it('supports a text selection without a screenshot', () => {
    context.screenshotStatus = 'idle'
    context.target.anchor = { kind: 'text_range', selectedText: 'Selected copy', normalizedText: 'Selected copy', prefix: '', suffix: '', containerSelector: '#copy', startOffset: 0, endOffset: 13, createdFromUrl: context.target.url }
    composer()
    expect(screen.getByText(/Selected copy/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Remove screenshot' })).not.toBeInTheDocument()
  })
})

describe('voice player', () => {
  it('plays, updates time, pauses, ends, and stops playback on unmount', async () => {
    const view = render(<VoicePlayer clip={audioClip} />)
    const audio = view.container.querySelector('audio')!
    const play = vi.spyOn(audio, 'play').mockImplementation(async () => { fireEvent.play(audio) })
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => { fireEvent.pause(audio) })
    click('Play voice note'); await screen.findByRole('button', { name: 'Pause voice note' })
    audio.currentTime = 4; fireEvent.timeUpdate(audio)
    expect(screen.getByText('00:04')).toBeVisible()
    click('Pause voice note'); expect(pause).toHaveBeenCalledOnce()
    click('Play voice note'); await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    fireEvent.ended(audio); expect(screen.getByText('00:12')).toBeVisible()
    view.unmount(); expect(pause).toHaveBeenCalledTimes(2)
  })
  it('reports playback errors', async () => {
    const view = render(<VoicePlayer clip={audioClip} />)
    const audio = view.container.querySelector('audio')!
    vi.spyOn(audio, 'play').mockRejectedValue(new Error('blocked'))
    click('Play voice note'); expect(await screen.findByRole('alert')).toHaveTextContent('Playback could not start')
    fireEvent.error(audio); expect(screen.getByRole('alert')).toHaveTextContent('could not be played')
  })
  it.each(['ready', 'partial', 'unavailable'] as const)('shows the real %s transcription result without sample copy', status => {
    render(<VoicePlayer clip={{ ...audioClip, transcript: { text: status === 'unavailable' ? '' : transcript.text, status, reason: status === 'ready' ? '' : 'Speech service unavailable' } }} transcript />)
    click(status === 'unavailable' ? 'Transcript unavailable' : 'Show transcript')
    if (status !== 'unavailable') expect(screen.getByText(transcript.text)).toBeVisible()
    else expect(screen.getByText('Speech service unavailable')).toBeVisible()
    click('Hide transcript'); expect(screen.queryByText(transcript.text)).not.toBeInTheDocument()
  })
  it('formats durations', () => { expect(formatDuration(0)).toBe('00:00'); expect(formatDuration(65.9)).toBe('01:05') })
})
