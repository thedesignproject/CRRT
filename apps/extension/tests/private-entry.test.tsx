import { expect, it, vi } from 'vitest'
const render = vi.hoisted(() => vi.fn())
const frame = vi.hoisted(() => vi.fn())
vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render })) }))
vi.mock('../lib/private-frame', () => ({ usePrivateFrame: frame }))
vi.mock('../lib/personal-widget', () => ({ ExtensionWidget: () => null }))
it('boots the widget inside the extension-owned document', async () => {
  const root = document.createElement('div'); root.id = 'root'; document.body.append(root)
  const { PrivateFrame } = await import('../entrypoints/private/main')
  const { createRoot } = await import('react-dom/client')
  expect(createRoot).toHaveBeenCalledWith(root)
  expect(render).toHaveBeenCalledOnce()
  frame.mockReturnValue({ page: null, activate: false })
  expect(PrivateFrame()).toBeNull()
  const page = { url: 'https://site.test' }
  frame.mockReturnValue({ page, activate: true })
  expect(PrivateFrame()?.props).toEqual({ page, activate: true })
  root.remove()
})
