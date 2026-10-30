import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: mocks.createRoot }))
vi.mock('./main', () => ({ RecordControls: () => <div>controls</div> }))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"></div>'
  mocks.createRoot.mockReturnValue({ render: mocks.render })
})

it('boots the standalone fallback controls page', async () => {
  await import('./bootstrap')
  expect(mocks.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
  expect(mocks.render).toHaveBeenCalledOnce()
})
