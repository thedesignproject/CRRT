import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@lucasmarkes/hairline', () => {
  const figure = (name: string) => (root: HTMLElement, options: {play:boolean;intensity:number}) => {
    const child=document.createElement('div')
    child.dataset.testid=name; child.dataset.play=String(options.play); child.dataset.intensity=String(options.intensity)
    child.tabIndex=-1; root.append(child)
    return {destroy:()=>child.remove()}
  }
  return { exploded:figure('Exploded'), branches:figure('Branches'), laptop:figure('Laptop') }
})
import { ResourceFigure } from './ResourceFigure'

it('uses the requested Hairline artwork without idle animation or decorative tab stops', async () => {
  const view = render(<ResourceFigure track="design-systems" />)
  expect(await screen.findByTestId('Exploded')).toHaveAttribute('data-play', 'false')
  expect(screen.getByTestId('Exploded')).toHaveAttribute('tabindex', '-1')
  expect(screen.getByTestId('Exploded').parentElement!.parentElement).toHaveAttribute('aria-hidden', 'true')
  view.rerender(<ResourceFigure track="agentic-workflows" />)
  expect(await screen.findByTestId('Branches')).toBeInTheDocument()
  view.rerender(<ResourceFigure track="ai-prototyping" />)
  expect(await screen.findByTestId('Laptop')).toBeInTheDocument()
})
