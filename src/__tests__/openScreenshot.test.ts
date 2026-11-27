import { afterEach, expect, it, vi } from 'vitest'
import { openScreenshot } from '../components/FeedbackWidget/openScreenshot'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('opens a saved data image through a temporary blob URL', async () => {
  vi.useFakeTimers()
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:opened')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  openScreenshot('data:image/png;base64,cG5n')
  const blob = create.mock.calls[0][0] as Blob
  expect(blob.type).toBe('image/png')
  expect(await blob.text()).toBe('png')
  expect(open).toHaveBeenCalledWith('blob:opened', '_blank', 'noopener,noreferrer')
  expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(60_000)
  expect(revoke).toHaveBeenCalledWith('blob:opened')
})

it('skips malformed data and excludes non-raster content from blob navigation', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  openScreenshot('data:text/html;base64,PGgxPg==')
  openScreenshot('data:image/png;base64,a')
  expect(open).not.toHaveBeenCalled()
})
