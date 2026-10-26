import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InstallPaths } from './InstallPaths'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('lets visitors compare capture methods in one stage without scrolling', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const { container } = render(<InstallPaths />)
  container.querySelectorAll('[data-mode]').forEach(element => { element.scrollIntoView = vi.fn() })
  for (const label of ['Widget', 'Chrome', 'Storybook', 'Record']) {
    const button = screen.getByRole('button', { name: new RegExp(label) })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.capture-theatre-demo .landing-capture-stage')).toHaveClass('is-' + label.toLowerCase())
  }
  expect(screen.getAllByText('Private preview').length).toBeGreaterThan(0)
  expect(screen.getAllByRole('link', { name: /Connect Storybook/ })[0]).toHaveAttribute('href', 'http://localhost:5173')
})

it('updates the demo as scroll markers enter and cleans up the observer', () => {
  let callback: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(next: IntersectionObserverCallback) { callback = next }
    observe = vi.fn()
    disconnect = disconnect
  })
  const { container, unmount } = render(<InstallPaths />)
  const target = container.querySelector('[data-mode="chrome"]')!
  act(() => callback([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(screen.getByRole('button', { name: /Chrome/ })).toHaveAttribute('aria-pressed', 'true')
  act(() => callback([{ target, isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(screen.getByRole('button', { name: /Chrome/ })).toHaveAttribute('aria-pressed', 'true')
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
