import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@lucasmarkes/hairline/react', () => {
  const figure = (name: string) => (props: { play: boolean; intensity: number; tabIndex: number }) => <div data-testid={name} data-play={String(props.play)} data-intensity={props.intensity} tabIndex={props.tabIndex} />
  return { Exploded: figure('Exploded'), Branches: figure('Branches'), Laptop: figure('Laptop') }
})
import { ResourceFigure } from './ResourceFigure'

it('uses the requested Hairline artwork without idle animation or decorative tab stops', async () => {
  const view = render(<ResourceFigure track="design-systems" />)
  expect(await screen.findByTestId('Exploded')).toHaveAttribute('data-play', 'false')
  expect(screen.getByTestId('Exploded')).toHaveAttribute('tabindex', '-1')
  expect(screen.getByTestId('Exploded').parentElement).toHaveAttribute('aria-hidden', 'true')
  view.rerender(<ResourceFigure track="agentic-workflows" />)
  expect(await screen.findByTestId('Branches')).toBeInTheDocument()
  view.rerender(<ResourceFigure track="ai-prototyping" />)
  expect(await screen.findByTestId('Laptop')).toBeInTheDocument()
})
