import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { RecordingVideoCanvas } from './RecordingVideoCanvas'

afterEach(() => vi.restoreAllMocks())

function mount(context: unknown) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D)
  const source = createRef<HTMLVideoElement>()
  const view = render(<><video ref={source} hidden /><RecordingVideoCanvas source={source} /></>)
  return { ...view, video: source.current! }
}

it('paints centered square camera frames after decoding and seeking without showing the video source', () => {
  const drawImage = vi.fn()
  const { video } = mount({ drawImage })
  expect(video).not.toBeVisible()
  expect(screen.getByRole('img', { name: 'Camera preview' })).toBeVisible()
  expect(drawImage).not.toHaveBeenCalled()
  Object.defineProperties(video, { readyState: { value: 2, configurable: true }, videoWidth: { value: 1920, configurable: true }, videoHeight: { value: 1080, configurable: true } })
  fireEvent.loadedData(video)
  expect(drawImage).toHaveBeenLastCalledWith(video, 420, 0, 1080, 1080, 0, 0, 256, 256)
  Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true })
  fireEvent.seeked(video)
  expect(drawImage).toHaveBeenCalledTimes(1)
  Object.defineProperties(video, { videoWidth: { value: 0, configurable: true }, videoHeight: { value: 1080, configurable: true } })
  fireEvent.seeked(video)
  expect(drawImage).toHaveBeenCalledTimes(1)
  Object.defineProperty(video, 'videoWidth', { value: 720, configurable: true })
  fireEvent.seeked(video)
  expect(drawImage).toHaveBeenLastCalledWith(video, 0, 180, 720, 720, 0, 0, 256, 256)
})

it('updates during playback and stops after pause, end, and unmount', () => {
  const drawImage = vi.fn()
  let next!: FrameRequestCallback
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { next = callback; return 7 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const { video, unmount } = mount({ drawImage })
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 }, paused: { value: false, configurable: true }, ended: { value: false, configurable: true } })
  fireEvent.play(video)
  act(() => next(0))
  expect(drawImage).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledTimes(2)
  Object.defineProperty(video, 'paused', { value: true, configurable: true })
  act(() => next(1))
  expect(request).toHaveBeenCalledTimes(2)
  Object.defineProperties(video, { paused: { value: false, configurable: true }, ended: { value: true, configurable: true } })
  fireEvent.play(video)
  act(() => next(2))
  expect(request).toHaveBeenCalledTimes(3)
  unmount()
  expect(cancel).toHaveBeenCalledWith(7)
  fireEvent.seeked(video); fireEvent.play(video)
  expect(drawImage).toHaveBeenCalledTimes(3)
})

it('leaves the player usable when canvas rendering is unavailable', () => {
  mount(null)
  expect(screen.getByRole('img', { name: 'Camera preview' })).toBeInTheDocument()
})

it('paints screen frames at native resolution without cropping or changing canvas size on every frame', () => {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  const source = createRef<HTMLVideoElement>()
  render(<><video ref={source} hidden /><RecordingVideoCanvas source={source} crop={false} label="Recording picture" className="recording-primary-video" /></>)
  const video = source.current!
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 1920 }, videoHeight: { value: 1080 } })
  fireEvent.loadedData(video)
  const surface = screen.getByRole('img', { name: 'Recording picture' }) as HTMLCanvasElement
  expect(surface.width).toBe(1920); expect(surface.height).toBe(1080)
  expect(drawImage).toHaveBeenLastCalledWith(video, 0, 0)
  fireEvent.seeked(video)
  expect(drawImage).toHaveBeenCalledTimes(2)
})

it('uses decoded-frame callbacks when available so painting follows the video frame rate', () => {
  const drawImage = vi.fn()
  let next!: VideoFrameRequestCallback
  const request = vi.fn(callback => { next = callback; return 9 })
  const cancel = vi.fn()
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true, value: request })
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: cancel })
  const { video, unmount } = mount({ drawImage })
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 }, paused: { value: false }, ended: { value: false } })
  fireEvent.play(video)
  act(() => next(0, {} as VideoFrameCallbackMetadata))
  expect(drawImage).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledTimes(2)
  unmount()
  expect(cancel).toHaveBeenCalledWith(9)
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).requestVideoFrameCallback
  delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>).cancelVideoFrameCallback
})
