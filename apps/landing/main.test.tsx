import { act } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn(), hydrateRoot: vi.fn(), load: vi.fn() }))
vi.mock('react-dom/client', () => ({ default: { createRoot: state.createRoot, hydrateRoot: state.hydrateRoot } }))
vi.mock('./loadLandingApp', () => ({ loadLandingApp: state.load }))

beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

it('mounts the existing application after loading its interactive surface', async () => {
  document.body.innerHTML = '<div id="root"><main>Prerendered article</main></div>'
  state.createRoot.mockReturnValue({ render: state.render })
  let resolve!: (app: React.ReactNode) => void
  state.load.mockReturnValue(new Promise(done => { resolve = done }))
  await import('./main')
  expect(state.createRoot).not.toHaveBeenCalled()
  expect(document.querySelector('main')).toHaveTextContent('Prerendered article')
  await act(async () => { resolve(<main>Interactive article</main>) })
  expect(state.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
  expect(state.render).toHaveBeenCalledOnce()
})

it('hydrates resource content in place so delayed JavaScript does not replace the article', async () => {
  document.body.innerHTML = '<div id="root"><div class="resources-shell"><main>Prerendered article</main></div></div>'
  state.load.mockResolvedValue(<main>Interactive article</main>)
  await act(async () => { await import('./main') })
  expect(state.hydrateRoot).toHaveBeenCalledWith(document.getElementById('root'), expect.anything())
  expect(state.createRoot).not.toHaveBeenCalled()
  expect(document.querySelector('main')).toHaveTextContent('Prerendered article')
})
