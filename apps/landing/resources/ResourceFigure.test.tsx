import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const destroy = vi.hoisted(() => vi.fn())
vi.mock('@lucasmarkes/hairline', () => {
  const figure = (name: string) => (root: HTMLElement, props: { play: boolean; intensity: number }) => {
    root.dataset.testid = name
    root.dataset.play = String(props.play)
    root.dataset.intensity = String(props.intensity)
    return { destroy }
  }
  return { exploded: figure('Exploded'), branches: figure('Branches'), laptop: figure('Laptop') }
})
import { ResourceFigure } from './ResourceFigure'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('uses the requested Hairline artwork without idle animation or decorative tab stops', async () => {
  const view = render(<ResourceFigure track="design-systems" />)
  expect(await screen.findByTestId('Exploded')).toHaveAttribute('data-play', 'false')
  expect(screen.getByTestId('Exploded')).toHaveAttribute('tabindex', '-1')
  expect(screen.getByTestId('Exploded').parentElement).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByTestId('Exploded')).toHaveAttribute('data-intensity', '0.45')
  view.rerender(<ResourceFigure track="agentic-workflows" />)
  expect(await screen.findByTestId('Branches')).toBeInTheDocument()
  view.rerender(<ResourceFigure track="ai-prototyping" />)
  expect(await screen.findByTestId('Laptop')).toBeInTheDocument()
  expect(destroy).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(destroy).toHaveBeenCalledTimes(3)
})
