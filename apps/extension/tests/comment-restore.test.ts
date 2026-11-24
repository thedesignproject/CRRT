import { expect, it, vi } from 'vitest'

const mountWidgetIfActive = vi.hoisted(() => vi.fn())
vi.mock('wxt/utils/define-unlisted-script', () => ({ defineUnlistedScript: (main: unknown) => main }))
vi.mock('../entrypoints/comment', () => ({ mountWidgetIfActive }))

import restore from '../entrypoints/comment-restore'

it('remounts an activated tab after reload without entering comment mode', () => {
  ;(restore as unknown as () => void)()
  expect(mountWidgetIfActive).toHaveBeenCalledWith(false)
})
