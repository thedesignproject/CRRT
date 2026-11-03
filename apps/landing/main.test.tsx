import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({mount:vi.fn()}))
vi.mock('./mountLandingApp',()=>({mountLandingApp:state.mount}))
beforeEach(()=>{vi.resetModules();vi.clearAllMocks()})
afterEach(()=>vi.unstubAllGlobals())
it('starts existing application routes immediately',async()=>{
  document.body.innerHTML='<div id="root"><main>Existing app</main></div>'
  await import('./main')
  await vi.dynamicImportSettled()
  expect(state.mount).toHaveBeenCalledWith(window.location.pathname)
})
it('leaves public resources visible for a paint before fetching the renderer',async()=>{
  const frames:FrameRequestCallback[]=[]
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length})
  document.body.innerHTML='<div id="root"><div class="resources-shell"><main>Readable article</main></div></div>'
  await import('./main')
  expect(state.mount).not.toHaveBeenCalled()
  frames[0](0)
  expect(state.mount).not.toHaveBeenCalled()
  expect(document.querySelector('main')!.textContent).toBe('Readable article')
  frames[1](16)
  await vi.dynamicImportSettled()
  expect(state.mount).toHaveBeenCalledWith(window.location.pathname)
})
