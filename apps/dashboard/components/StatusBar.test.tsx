import { act, fireEvent, render, renderHook } from '@testing-library/react'
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

const keysIn = (container: HTMLElement) => [...container.querySelectorAll('kbd')].map(key => key.textContent)

it('stays hidden until "?" and lists project shortcuts', () => {
  const view = render(<StatusBar />)
  expect(view.container.querySelector('kbd')).toBeNull()
  fireEvent.keyDown(window, { key: '?' })
  expect(keysIn(view.container)).toEqual(['A', 'M', 'D', 'Space', 'J', 'K', 'S', '⌘K', '?'])
  fireEvent.keyDown(window, { key: '?' })
  expect(view.container.querySelector('kbd')).toBeNull()
})

it('closes with Escape and ignores "?" with modifiers or while typing', () => {
  const view = render(<><input aria-label="Reply" /><div contentEditable data-testid="editor" /><StatusBar /></>)
  fireEvent.keyDown(view.getByLabelText('Reply'), { key: '?' })
  fireEvent.keyDown(view.getByTestId('editor'), { key: '?' })
  fireEvent.keyDown(window, { key: '?', metaKey: true })
  fireEvent.keyDown(window, { key: '?', ctrlKey: true })
  fireEvent.keyDown(window, { key: '?', altKey: true })
  fireEvent.keyDown(window, { key: 'x' })
  expect(view.container.querySelector('kbd')).toBeNull()
  fireEvent.keyDown(window, { key: '?' })
  expect(view.container.querySelector('kbd')).not.toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(view.container.querySelector('kbd')).toBeNull()
})

it.each([false, true])('hides and restores shortcuts when the preference toggles (personal=%s)', (personal) => {
  const preference = renderHook(() => useKeyboardShortcuts('dashboard'))
  const view = render(<StatusBar personal={personal} agentAvailable={false} />)
  fireEvent.keyDown(window, { key: '?' })
  const expected = personal ? ['Space', 'J', 'K', '?'] : ['A', 'M', 'D', 'Space', 'J', 'K', '⌘K', '?']
  expect(keysIn(view.container)).toEqual(expected)
  act(() => preference.result.current[1](false))
  expect(keysIn(view.container)).toEqual([])
  fireEvent.keyDown(window, { key: '?' })
  expect(keysIn(view.container)).toEqual([])
  act(() => preference.result.current[1](true))
  expect(keysIn(view.container)).toEqual(expected)
})
