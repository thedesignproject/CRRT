// Characters that would need escaping in a CSS identifier (used for both
// id selectors and class selectors — same character rules for unescaped form).
const INVALID_IDENT_CHARS = /[^a-zA-Z0-9_-]/
const INVALID_IDENT_START = /^(?:-?[0-9]|-$)/

function isValidIdentifier(name: string): boolean {
  return name.length > 0 && !INVALID_IDENT_CHARS.test(name) && !INVALID_IDENT_START.test(name)
}

export function getSelector(el: Element): string {
  if (el === document.body) return 'body'

  const parts: string[] = []
  let current: Element | null = el

  while (current && current !== document.body) {
    if (isValidIdentifier(current.id)) {
      parts.unshift(`#${current.id}`)
      break
    }
    const tag = current.tagName.toLowerCase()
    const safeClasses = typeof current.className === 'string'
      ? current.className.split(/\s+/).filter(isValidIdentifier)
      : []
    let selector = tag + safeClasses.slice(0, 2).map(name => '.' + name).join('')

    const parent: Element | null = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current!.tagName
      )
      // A shared class identifies repeated cards. Keep their position in
      // the group independent of classes that move with the active state.
      const sharedClass = safeClasses.find(name =>
        siblings.some(sibling => sibling !== current && sibling.classList.contains(name))
      )
      if (sharedClass) selector = tag + '.' + sharedClass
      if (siblings.filter((sibling) => sibling.matches(selector)).length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    parts.unshift(selector)
    current = parent
  }

  return parts.join(' > ')
}
