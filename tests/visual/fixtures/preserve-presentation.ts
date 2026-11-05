// Chromium can paint CSS variable shorthands whose CSSOM serialization contains
// empty longhands after a single longhand changes. rrweb replays that serialized
// text, so preserve the affected computed values before taking either checkpoint.
export function preservePresentation() {
  // Persist entrance animations before both checkpoints. screenshot() temporarily
  // finishes CSS animations, then restores them; rrweb can otherwise serialize a
  // newly restarted, invisible first frame (notably the private-login overlay).
  const animated = new Set<HTMLElement | SVGElement>()
  for (const animation of document.getAnimations()) {
    if (animation.effect?.getComputedTiming().iterations === Infinity) continue
    const target = (animation.effect as KeyframeEffect | null)?.target
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) continue
    try { animation.finish(); animation.commitStyles(); animated.add(target) } catch {}
  }
  for (const target of animated) target.style.setProperty('animation', 'none', 'important')
  // Document-level adopted sheets are not included by this rrweb version.
  for (const sheet of document.adoptedStyleSheets) { const style = document.createElement('style'); style.dataset.crrtAdopted = 'true'; style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n'); document.head.append(style) }
  // React may retain an initial checked attribute after the live property clears.
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type=checkbox],input[type=radio]')) input.toggleAttribute('checked', input.checked)
  const fonts = ['font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant', 'font-feature-settings', 'font-variation-settings', 'line-height']
  const affected = new Map<HTMLElement, Set<string>>()
  const borders = ['border-top', 'border-right', 'border-bottom', 'border-left']
  function visit(rules: CSSRuleList) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const properties = [...(/font-(?:style|weight|family):\s*;/.test(rule.cssText) ? fonts : []), ...(/border-[\w-]+:\s*;/.test(rule.cssText) ? borders : [])]
        if (properties.length) try { for (const element of document.querySelectorAll(rule.selectorText)) if (element instanceof HTMLElement) affected.set(element, new Set([...(affected.get(element) ?? []), ...properties])) } catch {}
      }
      if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules)
    }
  }
  for (const sheet of document.styleSheets) { try { visit(sheet.cssRules) } catch {} }
  const changes: { element: HTMLElement; values: [string, string][] }[] = []
  for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
    const properties = [...(affected.get(element) ?? [])]
    if (/border-[\w-]+:\s*;/.test(element.getAttribute('style') ?? '')) properties.push(...borders)
    if (properties.length) { const style = getComputedStyle(element); changes.push({ element, values: properties.map(name => [name, style.getPropertyValue(name)]) }) }
  }
  for (const { element, values } of changes) for (const [name, value] of values) element.style.setProperty(name, value)
}
