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
})
