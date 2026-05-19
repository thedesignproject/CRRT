import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PinMarker } from '../components/FeedbackWidget/pin/PinMarker'

/** Inner dot is the last child of the wrapper (halo, when present, comes first). */
function getDot(container: HTMLElement): HTMLElement {
  return (container.firstChild as HTMLElement).lastElementChild as HTMLElement
}

describe('PinMarker', () => {
  it('renders without outline by default', () => {
    const { container } = render(<PinMarker />)
    const dot = getDot(container)
    expect(dot.style.outlineStyle).toBe('none')
    expect(dot.style.outlineOffset).toBe('0')
  })

  it('renders with white outline when outline=true', () => {
    const { container } = render(<PinMarker outline />)
    const dot = getDot(container)
    expect(dot.style.outlineWidth).toBe('2px')
    expect(dot.style.outlineStyle).toBe('solid')
    expect(dot.style.outlineColor).toBe('#fff')
    expect(dot.style.outlineOffset).toBe('2px')
  })

  it('hides the number at rest (collapsed dot) — pins stay discreet', () => {
    const { container } = render(<PinMarker number={3} />)
    expect(container.textContent).toBe('')
  })

  it('reveals the number when hovered (expanded dot)', () => {
    const { container } = render(<PinMarker number={3} hovered />)
    expect(container.textContent).toBe('3')
  })

  it('reveals the number when selected (outline) — expanded by selection', () => {
    const { container } = render(<PinMarker number={7} outline />)
    expect(container.textContent).toBe('7')
  })

  it('renders empty string when number is 0 even when expanded', () => {
    const { container } = render(<PinMarker number={0} hovered />)
    expect(container.textContent).toBe('')
  })

  it('renders empty string when number is undefined', () => {
    const { container } = render(<PinMarker />)
    expect(container.textContent).toBe('')
  })

  it('renders muted styling when resolved=true', () => {
    const { container } = render(<PinMarker number={5} resolved hovered />)
    const dot = getDot(container)
    expect(dot.style.background).toBe('transparent')
    expect(dot.style.color).toBe('#6B6560')
    expect(dot.style.boxShadow).toContain('#6B6560')
  })

  it('inner dot bounces at rest, no animation when expanded or resolved', () => {
    const { container: rest } = render(<PinMarker />)
    expect(getDot(rest).style.animation).toContain('crrt-pin-seed-bounce')

    const { container: hov } = render(<PinMarker hovered />)
    expect(getDot(hov).style.animation).toBe('')

    const { container: sel } = render(<PinMarker outline />)
    expect(getDot(sel).style.animation).toBe('')

    const { container: res } = render(<PinMarker resolved />)
    expect(getDot(res).style.animation).toBe('')
  })

  it('renders a radiating halo at rest', () => {
    const { container } = render(<PinMarker />)
    const halo = container.querySelector<HTMLElement>('[data-fw-pin-halo]')
    expect(halo).not.toBeNull()
    expect(halo!.style.animation).toContain('crrt-pin-seed-halo')
    expect(halo!.style.pointerEvents).toBe('none')
  })

  it('hides the halo when hovered (expanded already draws attention)', () => {
    const { container } = render(<PinMarker hovered />)
    expect(container.querySelector('[data-fw-pin-halo]')).toBeNull()
  })

  it('hides the halo when selected (outline)', () => {
    const { container } = render(<PinMarker outline />)
    expect(container.querySelector('[data-fw-pin-halo]')).toBeNull()
  })

  it('hides the halo when resolved', () => {
    const { container } = render(<PinMarker resolved />)
    expect(container.querySelector('[data-fw-pin-halo]')).toBeNull()
  })
})
