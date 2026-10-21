import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineChart } from './LineChart'

const points = [
  { date: '2026-10-19', value: 2 },
  { date: '2026-10-20', value: 5 },
  { date: '2026-10-21', value: 1 },
]

function sizeChart(svg: Element, width: number) {
  svg.getBoundingClientRect = () => ({ left: 10, width } as DOMRect)
}

describe('LineChart', () => {
  it('shows an empty state without plotting anything', () => {
    render(<LineChart title="New comments" points={[]} />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.getByText('0 total')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('plots the series with axis labels and an accessible table', () => {
    render(<LineChart title="New comments" points={points} />)
    const chart = screen.getByRole('img', { name: 'New comments: 8 total over 3 days. Use arrow keys to inspect each day.' })
    expect(chart.querySelector('path')).toHaveAttribute('d', 'M4,56.8 L160,4 L316,74.4')
    expect(screen.getAllByText('Oct 19')).toHaveLength(2)
    expect(screen.getAllByText('Oct 21')).toHaveLength(2)
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('inspects the nearest day on hover and clears on leave', () => {
    render(<LineChart title="New comments" points={points} />)
    const chart = screen.getByRole('img')
    sizeChart(chart, 0)
    fireEvent.pointerMove(chart, { clientX: 100 })
    expect(screen.queryByRole('status')).toBeNull()
    sizeChart(chart, 200)
    fireEvent.pointerMove(chart, { clientX: 105 })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 20 5')
    fireEvent.pointerMove(chart, { clientX: 500 })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 21 1')
    fireEvent.pointerMove(chart, { clientX: -50 })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 19 2')
    fireEvent.pointerLeave(chart)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('steps through days with arrow keys and clears on blur', () => {
    render(<LineChart title="New comments" points={points} />)
    const chart = screen.getByRole('img')
    fireEvent.keyDown(chart, { key: 'Enter' })
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 19 2')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 19 2')
    fireEvent.blur(chart)
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 21 1')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Oct 21 1')
  })

  it('headlines the latest day for snapshot series', () => {
    const view = render(<LineChart title="Open backlog" points={points} summary="latest" />)
    expect(screen.getByText('1 latest')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Open backlog: 1 latest over 3 days. Use arrow keys to inspect each day.' })).toBeInTheDocument()
    view.rerender(<LineChart title="Open backlog" points={[]} summary="latest" />)
    expect(screen.getByText('0 latest')).toBeInTheDocument()
  })

  it('centers a single day and keeps its marker visible', () => {
    const { container } = render(<LineChart title="New comments" points={[{ date: '2026-10-21', value: 0 }]} />)
    expect(screen.getByRole('img').querySelector('path')).toHaveAttribute('d', 'M160,92')
    expect(container.querySelector('span[aria-hidden]')).toHaveStyle({ left: '50%', top: '95.83333333333334%' })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
