import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAuthorName } from '../components/FeedbackWidget/hooks/useAuthorName'
import { AUTHOR_NAME_KEY } from '../components/FeedbackWidget/constants'

describe('useAuthorName', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch {}
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns undefined when no name is stored', () => {
    const { result } = renderHook(() => useAuthorName())
    expect(result.current.authorName).toBeUndefined()
    expect(result.current.authorNameRef.current).toBeUndefined()
  })

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem(AUTHOR_NAME_KEY, 'Ada')
    const { result } = renderHook(() => useAuthorName())
    expect(result.current.authorName).toBe('Ada')
    expect(result.current.authorNameRef.current).toBe('Ada')
  })

  it('saveAuthorName trims and writes to state, ref, and localStorage', () => {
    const { result } = renderHook(() => useAuthorName())
    act(() => {
      result.current.saveAuthorName('  Bob  ')
    })
    expect(result.current.authorName).toBe('Bob')
    expect(result.current.authorNameRef.current).toBe('Bob')
    expect(localStorage.getItem(AUTHOR_NAME_KEY)).toBe('Bob')
  })

  it('saveAuthorName ignores empty/whitespace input', () => {
    const { result } = renderHook(() => useAuthorName())
    act(() => {
      result.current.saveAuthorName('   ')
    })
    expect(result.current.authorName).toBeUndefined()
    expect(localStorage.getItem(AUTHOR_NAME_KEY)).toBeNull()
  })

  it('openNameEditor pre-fills nameInput from the ref and shows the modal', () => {
    localStorage.setItem(AUTHOR_NAME_KEY, 'Ada')
    const { result } = renderHook(() => useAuthorName())
    act(() => {
      result.current.openNameEditor()
    })
    expect(result.current.showNameModal).toBe(true)
    expect(result.current.nameInput).toBe('Ada')
  })

  it('openNameEditor pre-fills empty when ref is undefined', () => {
    const { result } = renderHook(() => useAuthorName())
    act(() => {
      result.current.openNameEditor()
    })
    expect(result.current.nameInput).toBe('')
  })

  it('swallows localStorage errors on read', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => renderHook(() => useAuthorName())).not.toThrow()
    spy.mockRestore()
  })

  it('swallows localStorage errors on save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useAuthorName())
    act(() => {
      result.current.saveAuthorName('Bob')
    })
    expect(result.current.authorName).toBe('Bob')
    spy.mockRestore()
  })
})
