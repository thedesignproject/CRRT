import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PinMarker } from '../components/FeedbackWidget/pin/PinMarker'

describe('<PinMarker />', () => {
  it('renders without an outline by default', () => {
    const { container } = render(<PinMarker />)
    const pin = container.firstElementChild as HTMLElement
    expect(pin.style.outline).toContain('none')
  })

  it('renders with a 2px white outline when outline=true', () => {
    const { container } = render(<PinMarker outline />)
    const pin = container.firstElementChild as HTMLElement
    expect(pin.style.outline).toContain('2px')
    expect(pin.style.outline).toContain('#fff')
    expect(pin.style.outlineOffset).toBe('1px')
  })
})
