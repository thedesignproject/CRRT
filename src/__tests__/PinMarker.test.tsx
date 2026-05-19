import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PinMarker } from '../components/FeedbackWidget/pin/PinMarker'

describe('PinMarker', () => {
  it('renders without outline by default', () => {
    const { container } = render(<PinMarker />)
    const root = container.firstChild as HTMLElement
    expect(root.style.outlineStyle).toBe('none')
    expect(root.style.outlineOffset).toBe('0')
  })

  it('renders with white outline when outline=true', () => {
    const { container } = render(<PinMarker outline />)
    const root = container.firstChild as HTMLElement
    expect(root.style.outlineWidth).toBe('2px')
    expect(root.style.outlineStyle).toBe('solid')
    expect(root.style.outlineColor).toBe('#fff')
    expect(root.style.outlineOffset).toBe('1px')
  })

  it('renders number when number > 0', () => {
    const { container } = render(<PinMarker number={3} />)
    expect(container.textContent).toBe('3')
  })

  it('renders empty string when number is 0', () => {
    const { container } = render(<PinMarker number={0} />)
    expect(container.textContent).toBe('')
  })

  it('renders empty string when number is undefined', () => {
    const { container } = render(<PinMarker />)
    expect(container.textContent).toBe('')
  })

  it('renders muted styling when resolved=true', () => {
    const { container } = render(<PinMarker number={5} resolved />)
    const root = container.firstChild as HTMLElement
    expect(root.style.background).toBe('transparent')
    expect(root.style.color).toBe('#6B6560')
    expect(root.style.boxShadow).toContain('#6B6560')
  })
})
