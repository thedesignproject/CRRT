import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  createShare: vi.fn(),
  getPrompt: vi.fn(),
  getShareEvents: vi.fn(),
  getShareState: vi.fn(),
}))

import { createShare, getPrompt, getShareEvents, getShareState } from '../api'
import { useAgentSession } from './useAgentSession'

const mockMode = vi.hoisted(() => ({ enabled: false }))
vi.mock('../lib/mocks', () => ({ get mocksEnabled() { return mockMode.enabled } }))

beforeEach(() => {
  mockMode.enabled = false
  vi.mocked(createShare).mockReset().mockResolvedValue({
    shareId: 'share-1', slug: 'slug-1', token: 'share-token', tokenUrl: 'https://app.test/state', expiresAt: '', commentCount: 2,
  })
  vi.mocked(getPrompt).mockReset().mockResolvedValue({ prompt: 'Agent prompt', tokenUrl: 'https://app.test/state' })
  vi.mocked(getShareState).mockReset().mockResolvedValue({ presence: [] } as never)
  vi.mocked(getShareEvents).mockReset().mockResolvedValue({ events: [], nextCursor: 0 })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(() => vi.restoreAllMocks())

describe('useAgentSession', () => {
  it('creates an authenticated exact-selection session and copies its prompt', async () => {
    const ids = ['c1', 'c2']
    const { result, unmount } = renderHook(() => useAgentSession('/api', 'access-token', 'project', ids))
    await waitFor(() => expect(result.current.session?.shareId).toBe('share-1'))
    expect(createShare).toHaveBeenCalledWith('/api', 'access-token', {
      projectId: 'project', scopeType: 'selection', commentIds: ids,
    })

    await act(async () => { await result.current.copyPrompt('codex') })
    expect(getPrompt).toHaveBeenCalledWith('/api', 'access-token', 'share-1', 'codex')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Agent prompt')
    unmount()
  })

  it('does not create a broad session without an explicit selection and exposes entitlement codes', async () => {
    const empty = renderHook(() => useAgentSession('/api', 'access-token', 'project', []))
    expect(empty.result.current.session).toBeNull()
    expect(createShare).not.toHaveBeenCalled()
    empty.unmount()

    vi.mocked(createShare).mockRejectedValueOnce(Object.assign(new Error('Upgrade the plan'), { code: 'upgrade_required' }))
    const denied = renderHook(() => useAgentSession('/api', 'access-token', 'project', ['c1']))
    await waitFor(() => expect(denied.result.current.errorCode).toBe('upgrade_required'))
    expect(denied.result.current.error).toBe('Upgrade the plan')
    denied.unmount()
  })

  it('supports dashboard fixture mode without creating a remote share', async () => {
    mockMode.enabled = true
    const { result } = renderHook(() => useAgentSession('/api', 'access-token', 'project', ['c1']))
    await waitFor(() => expect(result.current.session?.shareId).toBe('mock-project'))
    expect(createShare).not.toHaveBeenCalled()
  })
})

it.each([null, 'offline', {code:42}])('handles session errors without a usable code: %j', async error => {
 vi.mocked(createShare).mockRejectedValueOnce(error)
 const {result,unmount}=renderHook(() => useAgentSession('/api','token','project',['c1']))
 await waitFor(() => expect(result.current.loading).toBe(false))
 expect(result.current.errorCode).toBeNull()
 expect(result.current.session).toBeNull()
 expect(result.current.error).toBe('Could not start session')
 unmount()
})

it('reconnects the same share across panel visibility, ready changes, and token refresh', async () => {
 const {result,rerender,unmount} = renderHook(({token,ids,enabled}) => useAgentSession('/api',token,'project',ids,enabled,'owner'), {initialProps:{token:'first',ids:['c1'],enabled:true}})
 await waitFor(() => expect(result.current.session?.shareId).toBe('share-1'))
 rerender({token:'second',ids:['c1','c2'],enabled:false})
 expect(result.current.session?.shareId).toBe('share-1')
 rerender({token:'second',ids:['c1','c2'],enabled:true})
 expect(createShare).toHaveBeenCalledTimes(1)
 expect(result.current.session?.shareId).toBe('share-1')
 vi.mocked(createShare).mockResolvedValueOnce({shareId:'share-2',slug:'slug-2',token:'token-2',tokenUrl:'url',expiresAt:'',commentCount:2})
 await act(async () => { await result.current.copyPrompt('codex') })
 expect(createShare).toHaveBeenLastCalledWith('/api','second',{projectId:'project',scopeType:'selection',commentIds:['c1','c2']})
 expect(result.current.session?.shareId).toBe('share-2')
 expect(getPrompt).toHaveBeenLastCalledWith('/api','second','share-2','codex')
 unmount()
})

it('adopts a bulk handoff share and resumes polling it without creating another', async () => {
 const {result,rerender,unmount} = renderHook(({enabled}) => useAgentSession('/api','token','project',['c1'],enabled,'owner'),{initialProps:{enabled:false}})
 expect(createShare).not.toHaveBeenCalled()
 await act(async () => result.current.adoptSession({shareId:'bulk',slug:'bulk-slug',token:'bulk-token',docUrl:'url'},['c1']))
 rerender({enabled:true})
 await waitFor(() => expect(getShareState).toHaveBeenCalledWith('/api','bulk-slug','bulk-token'))
 expect(createShare).not.toHaveBeenCalled()
 await act(async () => { await result.current.copyPrompt('codex') })
 expect(getPrompt).toHaveBeenCalledWith('/api','token','bulk','codex')
 unmount()
})

it('rejects an oversized sidebar selection without truncating it', async () => {
 const ids=Array.from({length:501},(_,i)=>`c${i}`)
 const {result,unmount}=renderHook(()=>useAgentSession('/api','token','project',ids))
 expect(result.current.error).toContain('up to 500')
 expect(createShare).not.toHaveBeenCalled()
 unmount()
})

it('keeps monitoring an existing share when the queue exceeds the handoff limit', async () => {
 const {result,rerender,unmount}=renderHook(({ids})=>useAgentSession('/api','token','project',ids),{initialProps:{ids:['c1']}})
 await waitFor(()=>expect(result.current.session).not.toBeNull())
 rerender({ids:Array.from({length:501},(_,i)=>`c${i}`)})
 await expect(result.current.copyPrompt('codex')).rejects.toThrow('between 1 and 500')
 expect(createShare).toHaveBeenCalledTimes(1)
 rerender({ids:[]})
 await expect(result.current.copyPrompt('codex')).rejects.toThrow('between 1 and 500')
 unmount()
})

it('discards the cached share on an account change', async () => {
 const {result,rerender,unmount}=renderHook(({owner})=>useAgentSession('/api','token','project',['c1'],true,owner),{initialProps:{owner:'first'}})
 await waitFor(()=>expect(result.current.session).not.toBeNull())
 vi.mocked(createShare).mockRejectedValueOnce(new Error('Denied'))
 rerender({owner:'second'})
 await waitFor(()=>expect(result.current.error).toBe('Denied'))
 expect(result.current.session).toBeNull()
 unmount()
})

it('does not let an initial share response overwrite a bulk-adopted session',async()=>{
 let resolve!: (v:any)=>void
 vi.mocked(createShare).mockReturnValueOnce(new Promise(r=>{resolve=r}))
 const {result,unmount}=renderHook(()=>useAgentSession('/api','token','project',['c1']))
 await act(async()=>result.current.adoptSession({shareId:'bulk',slug:'bulk-slug',token:'bulk-token',docUrl:'url'},['c1']))
 await act(async()=>resolve({shareId:'old',slug:'old',token:'old',tokenUrl:'old'}))
 expect(result.current.session?.shareId).toBe('bulk')
 expect(result.current.loading).toBe(false)
 unmount()
})

it('retains the running share when a new handoff fails to copy',async()=>{
 const {result,rerender,unmount}=renderHook(({ids})=>useAgentSession('/api','token','project',ids),{initialProps:{ids:['c1']}})
 await waitFor(()=>expect(result.current.session?.shareId).toBe('share-1'))
 rerender({ids:['c1','c2']})
 vi.mocked(createShare).mockResolvedValueOnce({shareId:'new',slug:'new',token:'new',tokenUrl:'url',expiresAt:'',commentCount:2})
 vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Clipboard denied'))
 await expect(result.current.copyPrompt('codex')).rejects.toThrow('Clipboard denied')
 expect(result.current.session?.shareId).toBe('share-1')
 unmount()
})

it.each(['share','prompt'])('discards a sidebar handoff after context changes during %s',async(step)=>{
 let finish!: (v:any)=>void
 const {result,rerender,unmount}=renderHook(({project,ids})=>useAgentSession('/api','token',project,ids),{initialProps:{project:'first',ids:['c1']}})
 await waitFor(()=>expect(result.current.session).not.toBeNull())
 rerender({project:'first',ids:['c1','c2']})
 const pending=new Promise<any>(r=>{finish=r})
 if(step==='share') vi.mocked(createShare).mockReturnValueOnce(pending)
 else vi.mocked(getPrompt).mockReturnValueOnce(pending)
 let copying!: Promise<string>
 act(()=>{copying=result.current.copyPrompt('codex'); copying.catch(()=>{})})
 if(step==='prompt') await waitFor(()=>expect(getPrompt).toHaveBeenCalled())
 rerender({project:'second',ids:[]})
 await act(async()=>finish(step==='share'?{shareId:'new',slug:'new',token:'new',tokenUrl:'url'}:{prompt:'old'}))
 await expect(copying).rejects.toThrow('Project changed')
 expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
 unmount()
})

it('reconnects cached project sessions after visiting another project',async()=>{
 const {result,rerender,unmount}=renderHook(({project})=>useAgentSession('/api','token',project,['c1'],true,'owner'),{initialProps:{project:'first'}})
 await waitFor(()=>expect(result.current.session?.shareId).toBe('share-1'))
 vi.mocked(createShare).mockResolvedValueOnce({shareId:'second-share',slug:'second',token:'second',tokenUrl:'url',expiresAt:'',commentCount:1})
 rerender({project:'second'})
 await waitFor(()=>expect(result.current.session?.shareId).toBe('second-share'))
 rerender({project:'first'})
 expect(result.current.session?.shareId).toBe('share-1')
 expect(createShare).toHaveBeenCalledTimes(2)
 unmount()
})

it('clears cached credentials when the API server changes',async()=>{
 const {result,rerender,unmount}=renderHook(({api})=>useAgentSession(api,'token','project',['c1'],true,'owner'),{initialProps:{api:'/first'}})
 await waitFor(()=>expect(result.current.session).not.toBeNull())
 vi.mocked(createShare).mockRejectedValueOnce(new Error('Different server'))
 rerender({api:'/second'})
 await waitFor(()=>expect(result.current.error).toBe('Different server'))
 expect(result.current.session).toBeNull()
 unmount()
})

it('retains and deduplicates the running share event history after reopening',async()=>{
 vi.mocked(getShareEvents).mockResolvedValue({events:[{id:1},{id:2}],nextCursor:2} as never)
 const {result,rerender,unmount}=renderHook(({enabled})=>useAgentSession('/api','token','project',['c1'],enabled),{initialProps:{enabled:true}})
 await waitFor(()=>expect(result.current.events).toHaveLength(2))
 rerender({enabled:false})
 rerender({enabled:true})
 await waitFor(()=>expect(getShareEvents).toHaveBeenCalledWith('/api','slug-1','share-token',2))
 expect(result.current.events).toHaveLength(2)
 unmount()
})
