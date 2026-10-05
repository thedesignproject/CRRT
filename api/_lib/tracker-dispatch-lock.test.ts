import {beforeEach,afterEach,expect,it,vi} from 'vitest'
vi.mock('postgres',()=>({default:vi.fn()}))
import postgres from 'postgres'
import {withTrackerDispatchLock} from './tracker-dispatch-lock.js'
let onclose:()=>void, query:ReturnType<typeof vi.fn>, end:ReturnType<typeof vi.fn>
beforeEach(()=>{
 vi.stubEnv('DATABASE_URL','postgres://test')
 query=vi.fn().mockResolvedValue([]);end=vi.fn().mockResolvedValue(undefined)
 vi.mocked(postgres).mockImplementation((_url:any,options:any)=>{
  onclose=options.onclose
  return {begin:async(work:any)=>work(query),end} as never
 })
})
afterEach(()=>vi.unstubAllEnvs())
it('holds the project lock through work and releases it on success',async()=>{
 let signal!:AbortSignal
 expect(await withTrackerDispatchLock('p',async s=>{signal=s;expect(query).toHaveBeenCalled();expect(end).not.toHaveBeenCalled();return 7})).toBe(7)
 expect(query.mock.calls[0][1]).toBe('p');expect(end).toHaveBeenCalled();expect(signal.aborted).toBe(true)
})
it('releases coordination after callback or lock errors',async()=>{
 await expect(withTrackerDispatchLock('p',async()=>{throw Error('work failed')})).rejects.toThrow('work failed');expect(end).toHaveBeenCalled()
 query.mockRejectedValueOnce(Error('lock failed'));await expect(withTrackerDispatchLock('p',async()=>1)).rejects.toThrow('lock failed')
})
it('fails closed when the coordination connection is unavailable or closes',async()=>{
 vi.stubEnv('DATABASE_URL','');await expect(withTrackerDispatchLock('p',async()=>1)).rejects.toThrow('tracker_coordination_unavailable')
 vi.stubEnv('DATABASE_URL','postgres://test');query.mockImplementationOnce(async()=>{onclose();return []})
 const work=vi.fn();await expect(withTrackerDispatchLock('p',work)).rejects.toThrow();expect(work).not.toHaveBeenCalled()
 await expect(withTrackerDispatchLock('p',async signal=>{onclose();signal.throwIfAborted();return 1})).rejects.toThrow()
})
