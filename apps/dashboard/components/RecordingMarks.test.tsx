import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { RecordingMarks } from './RecordingMarks'
import type { CaptureEvent } from '../../../shared/record/contracts'

const event = (type: string, points = [{ x: .2, y: .3 }, { x: .6, y: .7 }]) => ({ id: type, kind: 'mark', atMs: 1000, mark: { type, points, text: 'Fix this button', pinNumber: 2 } }) as CaptureEvent
it('renders every annotation tool with normalized geometry and safe text', () => {
  render(<RecordingMarks events={['draw', 'arrow', 'box', 'text', 'pin'].map(type => event(type))} atMs={1500} />)
  const svg = screen.getByRole('img', { name: 'Recording annotations' })
  expect(svg).toHaveClass('pointer-events-none')
  expect(svg.querySelector('polyline')).toHaveAttribute('points', '20,30 60,70')
  expect(svg.querySelector('line')).toHaveAttribute('x2', '60')
  expect(svg.querySelector('line')!.getAttribute('marker-end')).toBe(`url(#${svg.querySelector('marker')!.id})`)
  expect(svg.querySelector('rect')).toHaveAttribute('width', '40')
  expect(svg.querySelector('circle')).toHaveAttribute('cx', '20')
  expect(screen.getByText('Fix this button')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
})
it('seeks, fades and expires marks on the same three-second timeline as local review', () => {
  const events = [event('text')]
  const view = render(<RecordingMarks events={events} atMs={999} />)
  expect(screen.queryByText('Fix this button')).toBeNull()
  view.rerender(<RecordingMarks events={events} atMs={1000} />)
  expect(screen.getByText('Fix this button').parentElement).toHaveAttribute('opacity', '1')
  view.rerender(<RecordingMarks events={events} atMs={3875} />)
  expect(screen.getByText('Fix this button').parentElement).toHaveAttribute('opacity', '0.5')
  view.rerender(<RecordingMarks events={events} atMs={4000} />)
  expect(screen.queryByText('Fix this button')).toBeNull()
})
it('ignores non-mark/empty events and supports a one-point annotation', () => {
  render(<RecordingMarks events={[{ id: 'route', kind: 'route', atMs: 0 } as CaptureEvent, event('draw', []), event('arrow', [{ x: .2, y: .3 }])]} atMs={1000} />)
  const svg = screen.getByRole('img', { name: 'Recording annotations' })
  expect(svg.querySelector('polyline')).toBeNull()
  expect(svg.querySelector('line')).toHaveAttribute('x2', '20')
})
