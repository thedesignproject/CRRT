import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InstallPaths } from './InstallPaths'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('lets visitors switch explicitly between Chrome and Dashboard capture', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  render(<InstallPaths />)
  expect(screen.getByText('Captured with Chrome')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }))
  expect(screen.getByText('Captured with Dashboard')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Chrome/ }))
  expect(screen.getByText('Captured with Chrome')).toBeInTheDocument()
})

it('alternates the capture mode when motion is allowed', () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const clear = vi.spyOn(window, 'clearInterval')
  const rendered = render(<InstallPaths />)
  act(() => vi.advanceTimersByTime(5600))
  expect(screen.getByText('Captured with Dashboard')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(5600))
  expect(screen.getByText('Captured with Chrome')).toBeInTheDocument()
  rendered.unmount()
  expect(clear).toHaveBeenCalledOnce()
})
