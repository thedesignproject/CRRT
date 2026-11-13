import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { VoiceCommentPrototype } from './VoiceCommentPrototype'
const capture = vi.hoisted(() => vi.fn())
const captureState = vi.hoisted(() => ({ image: true }))
vi.mock('../../../src/lib/screenshotCapture', async original => ({
  ...await original<typeof import('../../../src/lib/screenshotCapture')>(),
  useScreenshotCapture: () => ({ image: new Blob(['image']), previewUrl: 'blob:screenshot', status: 'ready',
    capture, clear: vi.fn(), toBase64: async () => captureState.image ? ({ base64: 'eA==', mimeType: 'image/png' }) : null }),
}))
vi.mock('./recording', () => ({ startRecording: async () => ({ finish: async () => new Blob(['audio']), discard: vi.fn() }), recordingError: String }))
vi.mock('./transcription', () => ({ startTranscription: () => ({ finish: async () => ({ text: 'These are my actual words.', status: 'ready', reason: '' }) }) }))
const click = (name: string | RegExp) => fireEvent.click(screen.getAllByRole('button', { name })[0])
beforeEach(() => {
  vi.clearAllMocks()
  captureState.image = true
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  Object.defineProperty(document.documentElement, 'scrollWidth', { configurable: true, value: 1200 })
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 })
})
function page() {
  const view = render(<><main><button id="first">First page element</button><button id="second">Second page element</button></main><VoiceCommentPrototype /></>)
  for (const id of ['first', 'second']) vi.spyOn(document.getElementById(id)!, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 140, 200, 60))
  return view
}
async function select(name: string) {
  fireEvent.click(screen.getByRole('button', { name }), { clientX: 180, clientY: 160 })
  await screen.findByRole('textbox', { name: 'Comment' })
}
async function pin(index = 0) {
  const element = await waitFor(() => {
    const value = document.querySelectorAll<HTMLElement>('[data-fw-pin]')[index]
    expect(value).toBeTruthy(); return value
  })
  fireEvent.click(element)
}
async function sendAudio(note = '') {
  if (note) fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: note } })
  click('Record voice note'); await screen.findByText('Recording', { exact: true })
  click('Attach voice note'); await screen.findByText('Voice note')
  click('Send')
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument())
}
it('uses the actual launcher and lets the reviewer select different page elements before opening the composer', async () => {
  page()
  expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument()
  click('Open CRRT menu')
  fireEvent.click(screen.getByRole('menuitem', { name: /Drop comment/ }))
  await select('First page element')
  expect(capture).toHaveBeenCalledWith({ left: 100, top: 140, width: 200, height: 60 })
  const composer = screen.getByRole('region', { name: 'Leave feedback' }).parentElement!
  expect(composer.style.position).toBe('fixed')
  expect(composer.style.right).toBe('')
  click('Cancel')
  await select('Second page element')
  expect(screen.getByRole('textbox', { name: 'Comment' })).toBeVisible()
})
it('keeps audio attached to its selected pin, displays recognized words, and releases deleted recordings', async () => {
  const view = page()
  fireEvent.keyDown(window, { key: 'c' })
  await select('First page element'); await sendAudio('Please change the first element')
  await pin()
  click('Show transcript')
  expect(screen.getByText('These are my actual words.')).toBeVisible()
  expect(screen.queryByText(/Sample transcript/)).not.toBeInTheDocument()
  click('More options'); click('View list')
  expect(await screen.findByText('Prototype comments')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Play voice note' })).toBeVisible()
  // Return to selection using the product's shortcut and post a second, text-only comment.
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: 's' })
  await select('Second page element')
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: 'Second comment' } })
  click('Send'); await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument())
  await pin(0)
  expect(screen.getAllByText('Second comment')[0]).toBeVisible()
  click('More options'); click('Edit')
  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Edited second comment' } })
  click('Save'); await screen.findAllByText('Edited second comment')
  click('More options'); click('Delete')
  await waitFor(() => expect(document.querySelectorAll('[data-fw-pin]')).toHaveLength(1))
  await pin(); click('More options'); click('Delete')
  await waitFor(() => expect(document.querySelectorAll('[data-fw-pin]')).toHaveLength(0))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice')
  view.unmount()
})
it('supports audio-only comments and retains recording URLs until the whole prototype unmounts', async () => {
  captureState.image = false
  const view = page()
  fireEvent.keyDown(window, { key: 'c' })
  await select('First page element'); await sendAudio()
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:voice')
  await pin()
  expect(screen.getAllByText('Voice note')[0]).toBeVisible()
  click('More options'); click('View list')
  expect(screen.getByRole('button', { name: 'Play voice note' })).toBeVisible()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice')
})
