import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from '../../../src/lib/useKeyboardShortcuts'
import { StatusBar } from './StatusBar'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('shows project shortcuts by default', () => {
  const view = render(<StatusBar />)
  expect([...view.container.querySelectorAll('kbd')].map(key => key.textContent))
    .toEqual(['A', 'M', 'D', 'Space', 'J', 'K', 'S', '⌘K'])
})

it.each([false, true])('hides and restores footer shortcuts when toggled (personal=%s)', (personal) => {
  const preference = renderHook(() => useKeyboardShortcuts('dashboard'))
  const view = render(<StatusBar personal={personal} agentAvailable={false} />)
  const expected = personal ? ['Space', 'J', 'K'] : ['A', 'M', 'D', 'Space', 'J', 'K', '⌘K']
  const keys = () => [...view.container.querySelectorAll('kbd')].map(key => key.textContent)
  expect(keys()).toEqual(expected)
  act(() => preference.result.current[1](false))
  expect(keys()).toEqual([])
  act(() => preference.result.current[1](true))
  expect(keys()).toEqual(expected)
})

it.each([false, true])('hides footer shortcuts on initial load when disabled (personal=%s)', (personal) => {
  localStorage.setItem('crrt:keyboard-shortcuts:dashboard', 'disabled')
  const view = render(<StatusBar personal={personal} />)
  expect(view.container.querySelector('kbd')).toBeNull()
})
