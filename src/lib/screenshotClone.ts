import { getSelector } from './getSelector'

const DEFAULT_LIGATURES = new Set([
  'common-ligatures', 'no-discretionary-ligatures', 'no-historical-ligatures', 'contextual',
])

export function normalizeCloneLigatures(clone: Document) {
  const view = clone.defaultView
  if (!view) return
  const updates = new Map<CSSStyleDeclaration, string>()

  const collect = (root: Document | ShadowRoot) => {
    for (const element of root.querySelectorAll<HTMLElement | SVGElement>('*')) {
      if (element.style) {
        const value = view.getComputedStyle(element).getPropertyValue('font-variant-ligatures')
        if (value.includes(' ')) {
          // The renderer accepts one keyword. Preserve a non-default setting
          // where possible, and leave all single-keyword values alone.
          updates.set(element.style, value.split(' ').find(token => !DEFAULT_LIGATURES.has(token)) ?? 'normal')
        }
      }
      if (element.shadowRoot) collect(element.shadowRoot)
    }
  }

  collect(clone)
  for (const [style, value] of updates) style.setProperty('font-variant-ligatures', value, 'important')
}

function isCustomElement(element: Element) {
  return element.namespaceURI === 'http://www.w3.org/1999/xhtml' && element.localName.includes('-')
}

function isIgnored(node: Node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const element = node as Element
  return element.localName === 'script'
    || element.hasAttribute('data-fw')
    || element.hasAttribute('data-html2canvas-ignore')
}

function cloneTag(element: Element) {
  if (isCustomElement(element)) return 'div'
  return element.localName === 'video' ? 'canvas' : element.localName
}

// Custom element tag names are replaced with divs by html2canvas. Follow
// sibling order among matching clone tags so repeated hosts stay distinct.
function findCopy(element: Element, clone: Document): Element | undefined {
  const parent = element.parentElement
  if (!parent) return clone.documentElement
  const tag = cloneTag(element)
  const siblings = Array.from(parent.children).filter(child => !isIgnored(child) && cloneTag(child) === tag)
  return Array.from(findCopy(parent, clone)?.children ?? []).filter(child => child.localName === tag)[siblings.indexOf(element)]
}

function isHiddenSlot(slot: Element) {
  const style = slot.ownerDocument.defaultView!.getComputedStyle(slot)
  return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
    || style.opacity === '0' || style.contentVisibility === 'hidden'
}

function removeFlattenedHiddenSlots(source: ShadowRoot, copy: ShadowRoot) {
  const slots = Array.from(source.children).filter(child => child.localName === 'slot') as HTMLSlotElement[]
  const hidden = new Set(slots.filter(isHiddenSlot))
  if (!hidden.size) return

  // Direct slots are replaced with their assigned or fallback nodes. Account
  // for text nodes too, so removal neither leaks a label nor shifts siblings.
  const flattened = Array.from(source.childNodes).flatMap(node => {
    if (!slots.includes(node as HTMLSlotElement)) return [{ node, remove: false }]
    const slot = node as HTMLSlotElement
    const assigned = slot.assignedNodes()
    return Array.from(assigned.length ? assigned : slot.childNodes).map(node => ({ node, remove: hidden.has(slot) }))
  }).filter(({ node }) => !isIgnored(node))
  const children = Array.from(copy.childNodes).filter(node => (node as Element).localName !== 'html2canvaspseudoelement')
  if (!flattened.every(({ node }, index) => {
    const child = children[index]
    return child?.nodeType === node.nodeType
      && (node.nodeType !== Node.ELEMENT_NODE || cloneTag(node as Element) === (child as Element).localName)
  })) return
  flattened.forEach(({ remove }, index) => { if (remove) children[index].remove() })
}

export function restoreCloneShadows(clone: Document, hosts: Set<Element>) {
  for (const host of hosts) {
    const copy = isCustomElement(host) ? findCopy(host, clone) : clone.querySelector(getSelector(host))
    if (!copy) continue
    // The renderer flattens standard hosts into light DOM, leaking scoped CSS.
    if (!copy.shadowRoot) copy.attachShadow({ mode: 'open' }).append(...copy.childNodes)
    const shadow = copy.shadowRoot!
    removeFlattenedHiddenSlots(host.shadowRoot!, shadow)
    // Slots under a wrapper are retained, but the renderer traverses their
    // assigned nodes without checking the slot's visibility.
    for (const slot of shadow.querySelectorAll('slot')) {
      if (isHiddenSlot(slot)) slot.remove()
    }
  }
}
