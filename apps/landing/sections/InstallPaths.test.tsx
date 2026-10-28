import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InstallPaths } from './InstallPaths'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('pans through all four capture methods', () => {
  const queue: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => queue.push(callback))
  let top = 0
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top, height: window.innerHeight + 1200 }) as DOMRect)
  const { container } = render(<InstallPaths />)
  const frames = () => [...container.querySelectorAll('.reel-frame')]
  const strip = () => container.querySelector<HTMLElement>('.reel-strip')!

  expect(frames().map(frame => frame.querySelector('h3')?.textContent)).toEqual([
    'Comment inside the product.',
    'Review any page before installing code.',
    'Review the component inside its story.',
    'Show the flow, not only one frame.',
  ])
  expect(frames()[0]).toHaveClass('is-active')
  expect(strip().style.getPropertyValue('--reel-index')).toBe('0')

  for (const [index, offset] of [[1, -300], [2, -550], [3, -800], [3, -1150]]) {
    top = offset
    window.dispatchEvent(new Event('scroll'))
    act(() => { queue.splice(0).forEach(callback => callback(0)) })
    act(() => { vi.runAllTimers() })
    expect(frames()[index]).toHaveClass('is-active')
    expect(frames()[index]).toHaveAttribute('aria-current', 'step')
    expect(strip().style.getPropertyValue('--reel-index')).toBe(String(index))
  }

  expect(screen.getAllByText('Private preview').length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: /Connect Storybook/ })).toHaveAttribute('href', 'http://localhost:5173')
  expect(screen.getByRole('link', { name: /Install the widget/ })).toHaveAttribute('href', '/docs/install')
  expect(screen.queryByText(/Want full infrastructure control/)).toBeNull()
})

it('shows each capture surface as a real clip and plays only the one on screen', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementationOnce(() => Promise.reject(new Error('blocked'))).mockResolvedValue(undefined)
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  const callbacks: IntersectionObserverCallback[] = []
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { callbacks.push(callback) } observe = vi.fn(); disconnect = disconnect })
  const { container, unmount } = render(<InstallPaths />)
  const clips = [...container.querySelectorAll('video')]
  expect(clips.map(clip => clip.getAttribute('src'))).toEqual(['/capture-widget.mp4', '/capture-chrome.mp4', '/capture-storybook.mp4', '/capture-record.mp4'])
  expect(clips[0]).toHaveAttribute('poster', '/capture-widget.jpg')
  expect(screen.getByLabelText(/Storybook panel on an icon-only button story/)).toBe(clips[2])

  const show = (index: number, isIntersecting: boolean) => callbacks[index]([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
  show(0, true)
  await Promise.resolve()
  show(1, true)
  show(0, false)
  expect(play).toHaveBeenCalledTimes(2)
  expect(pause).toHaveBeenCalledOnce()
  unmount()
  expect(disconnect).toHaveBeenCalledTimes(4)
})

it('leaves the clips on their posters without IntersectionObserver or with reduced motion', () => {
  const observe = vi.fn()
  vi.stubGlobal('IntersectionObserver', undefined)
  render(<InstallPaths />)
  cleanup()
  vi.stubGlobal('IntersectionObserver', class { observe = observe; disconnect = vi.fn() })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
  render(<InstallPaths />)
  expect(observe).not.toHaveBeenCalled()
  cleanup()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  render(<InstallPaths />)
  expect(observe).toHaveBeenCalledTimes(4)
})
