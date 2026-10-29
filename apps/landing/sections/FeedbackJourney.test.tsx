import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BEATS_HELD, BEATS_PER_ACT, FeedbackJourney } from './FeedbackJourney'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

const RANGE = 1600

function renderStory() {
  const queue: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => queue.push(callback))
  let top = 0
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.classList.contains('story-track') ? { top, height: window.innerHeight + RANGE } : { width: 430, height: 330 }) as unknown as DOMRect
  })
  const view = render(<FeedbackJourney />)
  const scene = () => view.container.querySelector<HTMLElement>('.story-scene')!
  const goTo = (beat: number) => {
    top = -RANGE * (beat + .5) / (BEATS_PER_ACT * 4 + BEATS_HELD)
    window.dispatchEvent(new Event('scroll'))
    act(() => { queue.splice(0).forEach(callback => callback(0)) })
    act(() => { vi.runAllTimers() })
  }
  return { ...view, scene, goTo }
}

it('follows one comment from the page to the reviewed fix as the reader scrolls', () => {
  const { container, scene, goTo } = renderStory()
  const panel = () => within(scene()).getByRole('complementary', { name: 'Illustrative CRRT feedback workflow', hidden: true })
  const shownLines = () => scene().querySelectorAll('.story-terminal p.is-shown').length

  expect(screen.getByRole('heading', { name: 'Give your agent eyes on the product.' })).toBeInTheDocument()
  expect(scene()).toHaveAttribute('data-act', '0')
  expect(screen.getByRole('heading', { name: 'Point to the problem.' }).closest('article')).toHaveClass('is-active')
  expect(panel()).toHaveTextContent('1 comment · 0 ready')
  expect(container.querySelector<HTMLElement>('.story-viewport')!.style.getPropertyValue('--story-fit')).toBe('0.5000')

  goTo(4)
  expect(scene()).toHaveAttribute('data-act', '1')
  expect(panel()).toHaveTextContent('Project inbox')
  expect(panel()).not.toHaveTextContent('1 ready')

  goTo(6)
  expect(panel()).toHaveTextContent('Shared project · 1 ready')
  expect(panel().querySelector('.crrt-inbox-row.is-approved')).toHaveTextContent('Ready')

  goTo(7)
  expect(panel()).toHaveTextContent('Send feedback')
  expect(panel().textContent!.indexOf('Send to Claude Code')).toBeLessThan(panel().textContent!.indexOf('Linear'))

  goTo(8)
  expect(scene()).toHaveAttribute('data-act', '2')
  expect(container.querySelector('.story-track')).toHaveAttribute('data-act', '2')
  expect(shownLines()).toBe(0)
  expect(scene().querySelector('.story-prompt')).toHaveTextContent('claude "Fix CRRT feedback #24"')

  goTo(9)
  expect(shownLines()).toBe(2)
  goTo(11)
  expect(shownLines()).toBe(6)
  expect(scene().querySelector('.story-terminal')).toHaveTextContent('PR #212 links back to feedback #24')

  goTo(12)
  expect(scene()).toHaveAttribute('data-act', '3')
  expect(shownLines()).toBe(0)
  expect(panel()).toHaveTextContent('Fix ready')
  expect(panel()).toHaveTextContent('The change stays a draft until you approve it.')
  expect(within(panel()).getByRole('figure', { name: 'Pricing page after the fix with a prominent primary button', hidden: true })).toBeInTheDocument()
  expect(scene().querySelector('.story-card-after .story-ui')).toHaveClass('is-fixed')
  expect(scene().querySelector('.story-card-after .story-cta')).toHaveTextContent('Start free trial')
  expect(scene().querySelector('.story-toast')).toHaveTextContent('#24 fixed · ready for review')

  goTo(15)
  expect(scene()).toHaveAttribute('data-sub', '3')
  goTo(18)
  expect(scene()).toHaveAttribute('data-act', '3')
  expect(scene()).toHaveAttribute('data-sub', '3')
  expect(screen.getByRole('heading', { name: 'Review the fix.' }).closest('article')).toHaveClass('is-active')
})

it('fits the scene once when ResizeObserver is unavailable and observes size changes otherwise', () => {
  vi.stubGlobal('ResizeObserver', undefined)
  const first = renderStory()
  expect(first.container.querySelector<HTMLElement>('.story-viewport')!.style.getPropertyValue('--story-fit')).toBe('0.5000')
  first.unmount()
  vi.unstubAllGlobals()

  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect })
  const second = renderStory()
  expect(observe).toHaveBeenCalledWith(second.container.querySelector('.story-viewport'))
  second.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
