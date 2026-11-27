import { describe, it, expect, beforeEach } from 'vitest'
import { getSelector } from '../lib/getSelector'

describe('getSelector', () => {
  beforeEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild)
    }
  })

  it('prefers a safe id', () => {
    const el = document.createElement('div')
    el.id = 'my-thing'
    document.body.appendChild(el)
    expect(getSelector(el)).toBe('#my-thing')
  })

  it('skips ids that need escaping and walks the tree instead', () => {
    const parent = document.createElement('section')
    const el = document.createElement('div')
    el.id = 'not:safe'
    parent.appendChild(el)
    document.body.appendChild(parent)
    expect(getSelector(el)).toBe('section > div')
  })

  it('filters class names that would need CSS escaping', () => {
    const el = document.createElement('button')
    el.className = 'ok good_class invalid:class also@bad fine-class'
    document.body.appendChild(el)
    // Safe classes: ok, good_class, fine-class. getSelector truncates to 2.
    expect(getSelector(el)).toBe('button.ok.good_class')
  })

  it('disambiguates among same-tag siblings with nth-of-type', () => {
    const parent = document.createElement('ul')
    const a = document.createElement('li')
    const b = document.createElement('li')
    const c = document.createElement('li')
    parent.append(a, b, c)
    document.body.appendChild(parent)
    expect(getSelector(b)).toBe('ul > li:nth-of-type(2)')
  })

  it('does not emit nth-of-type for unique siblings', () => {
    const parent = document.createElement('div')
    const el = document.createElement('span')
    parent.appendChild(el)
    document.body.appendChild(parent)
    expect(getSelector(el)).toBe('div > span')
  })

  it('uses structural position when the browser exposes an animated SVG class name', () => {
    document.body.innerHTML = '<svg><g></g><g></g></svg>'
    const svgGroup = document.querySelectorAll('g')[1]
    Object.defineProperty(svgGroup, 'className', { value: { baseVal: 'frame', animVal: 'frame' } })
    expect(getSelector(svgGroup)).toBe('svg > g:nth-of-type(2)')
  })

  it('anchors at a nearby ID and stays stable when a different same-tag sibling appears', () => {
    document.body.innerHTML = '<section id="pricing"><h2>Other</h2><h2 class="title">Pricing</h2></section>'
    const title = document.querySelector('h2.title')!
    const selector = getSelector(title)
    title.before(document.createElement('h2'))
    expect(selector).toBe('#pricing > h2.title')
    expect(document.querySelector(selector)).toBe(title)
  })

  it('keeps a repeated card selector on the original card when active state moves', () => {
    document.body.innerHTML = '<section id="reel"><ol><li class="is-active frame"><h3>Original</h3></li><li class="frame"><h3>Next</h3></li></ol></section>'
    const [first, next] = document.querySelectorAll('li')
    const heading = first.querySelector('h3')!
    const selector = getSelector(heading)

    first.classList.remove('is-active')
    next.classList.add('is-active')

    expect(selector).toBe('#reel > ol > li.frame:nth-of-type(1) > h3')
    expect(document.querySelector(selector)).toBe(heading)
  })

  it('locates body and avoids creating invalid selectors from numeric IDs and classes', () => {
    document.body.innerHTML = '<p id="1" class="-2 valid">Text</p>'
    expect(getSelector(document.body)).toBe('body')
    expect(getSelector(document.body.firstElementChild!)).toBe('p.valid')
  })
})
