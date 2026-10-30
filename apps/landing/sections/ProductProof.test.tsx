import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProductProof } from './ProductProof'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('starts the dashboard video when observers are unavailable', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  render(<ProductProof />)
  expect(play).toHaveBeenCalledOnce()
})

it('plays and pauses the dashboard video with viewport visibility', () => {
  let update: IntersectionObserverCallback = () => undefined
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { update = callback }
    observe = vi.fn()
    disconnect = disconnect
  })
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)

  const rendered = render(<ProductProof />)
  act(() => update([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(play).toHaveBeenCalledOnce()
  act(() => update([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(pause).toHaveBeenCalledOnce()
  rendered.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('shows the real CRRT dashboard video inside the product frame', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)

  const { container } = render(<ProductProof />)
  const video = container.querySelector('video') as HTMLVideoElement

  expect(video).toHaveAttribute('src', '/crrt-dashboard.mp4')
  expect(video).toHaveAttribute('poster', '/crrt-dashboard-poster.jpg')
  expect(video).toHaveProperty('muted', true)
  expect(video).toHaveAttribute('loop')
  expect(video).toHaveAttribute('playsinline')
})

it('keeps the dashboard poster still when reduced motion is preferred', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  render(<ProductProof />)
  expect(play).not.toHaveBeenCalled()
})
