import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HowItWorks } from './HowItWorks'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('starts the workflow video without IntersectionObserver support', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()

  render(<HowItWorks />)

  expect(play).toHaveBeenCalledOnce()
})

it('plays and pauses as the workflow enters and leaves the viewport', () => {
  let update: IntersectionObserverCallback = () => undefined
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { update = callback }
    observe = observe
    disconnect = disconnect
  })
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)

  const rendered = render(<HowItWorks />)
  act(() => update([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(play).toHaveBeenCalledOnce()
  act(() => update([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(pause).toHaveBeenCalledOnce()
  rendered.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(pause).toHaveBeenCalledTimes(2)
})

it('keeps the workflow steps synchronized with one continuous product video', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)

  const { container } = render(<HowItWorks />)
  const spot = screen.getByRole('heading', { name: 'Spot it' }).closest('li')
  const mark = screen.getByRole('heading', { name: 'Mark it' }).closest('li')
  const ship = screen.getByRole('heading', { name: 'Ship it' }).closest('li')
  const video = container.querySelector('video') as HTMLVideoElement

  expect(spot).toHaveClass('is-active')
  expect(video).toHaveAttribute('src', '/crrt-workflow.mp4')
  expect(video).toHaveAttribute('poster', '/crrt-workflow-poster.jpg')
  expect(video).toHaveProperty('muted', true)
  expect(video).toHaveAttribute('loop')
  expect(video).toHaveAttribute('playsinline')
  video.currentTime = 2
  fireEvent.timeUpdate(video)
  expect(mark).toHaveClass('is-active')

  video.currentTime = .5
  fireEvent.timeUpdate(video)
  expect(spot).toHaveClass('is-active')

  video.currentTime = 6
  fireEvent.timeUpdate(video)
  expect(ship).toHaveClass('is-active')
})
