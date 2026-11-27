import { getSelector } from './getSelector'

type AnimationStyles = Map<string, Map<string, string>>

export function sampleAnimationStyles(): AnimationStyles {
  const targets = new Map<Element, Set<string>>()
  for (const animation of document.getAnimations?.() ?? []) {
    const effect = animation.effect
    if (!(effect instanceof KeyframeEffect) || !effect.target || effect.pseudoElement) continue
    const target = effect.target
    if (target.getRootNode() !== document || target.closest('[data-fw]')) continue
    let properties = targets.get(target)
    if (!properties) targets.set(target, properties = new Set())
    for (const { offset, computedOffset, easing, composite, ...frame } of effect.getKeyframes()) {
      for (const property of Object.keys(frame)) {
        properties.add(property.startsWith('--') ? property : property.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()))
      }
    }
  }

  const snapshot: AnimationStyles = new Map()
  for (const [target, properties] of targets) {
    const style = getComputedStyle(target)
    const values = new Map<string, string>()
    for (const property of properties) values.set(property, style.getPropertyValue(property))
    snapshot.set(getSelector(target), values)
  }
  return snapshot
}

export function applyAnimationStyles(clone: Document, snapshot: AnimationStyles) {
  for (const [selector, values] of snapshot) {
    const copy = clone.querySelector<HTMLElement | SVGElement>(selector)
    if (!copy) continue
    // CSS animations start a new timeline in the capture iframe, even when
    // the page is showing a finished keyframe through animation-fill-mode.
    copy.style.setProperty('animation', 'none', 'important')
    copy.style.setProperty('transition', 'none', 'important')
    for (const [property, value] of values) copy.style.setProperty(property, value, 'important')
  }
}
