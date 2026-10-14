import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('./supabase.js',()=>({getServiceSupabase:vi.fn()}))
import {getServiceSupabase} from './supabase.js'
import {cleanupDeletedExtensionScreenshots} from './extension-screenshot-cleanup.js'
const remove=vi.fn(),update=vi.fn(),order=vi.fn(),responses:unknown[]=[]
function query(){const q={eq:()=>q,lte:()=>q,select:()=>q,not:()=>q,order:(...args:unknown[])=>{order(...args);return q},limit:()=>q,
 update:(...args:unknown[])=>{update(...args);return q},in:()=>q,
 then:(resolve:(v:unknown)=>unknown,reject:(v:unknown)=>unknown)=>Promise.resolve(responses.shift()).then(resolve,reject)};return q}
beforeEach(()=>{vi.resetAllMocks();responses.length=0;remove.mockResolvedValue({error:null});vi.mocked(getServiceSupabase).mockReturnValue({from:query,storage:{from:()=>({remove})}} as never)})
it('fairly revisits durable deletion paths without dropping tombstones',async()=>{
 responses.push({data:[{id:'c',screenshot_storage_path:'actor/c.png'}],error:null},{error:null})
 await cleanupDeletedExtensionScreenshots()
 expect(remove).toHaveBeenCalledWith(['actor/c.png']);expect(order.mock.calls).toEqual([['cleanup_after'],['id']])
 expect(update).toHaveBeenCalledWith({cleanup_pending:false,cleanup_after:expect.any(String)})
})
it.each([null,[]])('does no storage work when no paths exist (%s)',async data=>{
 responses.push({data,error:null});await cleanupDeletedExtensionScreenshots();expect(remove).not.toHaveBeenCalled()
})
it('fails on lookup errors without attempting cleanup',async()=>{
 responses.push({data:null,error:{message:'lookup failed'}});await expect(cleanupDeletedExtensionScreenshots()).rejects.toThrow('lookup failed');expect(remove).not.toHaveBeenCalled()
})
it('advances failed batches so other deleted paths still receive cleanup',async()=>{
 responses.push({data:[{id:'c',screenshot_storage_path:'p'}],error:null},{error:null});remove.mockResolvedValue({error:{message:'storage failed'}})
 await expect(cleanupDeletedExtensionScreenshots()).rejects.toThrow('storage failed');expect(update).toHaveBeenCalledWith({cleanup_pending:true,cleanup_after:expect.any(String)})
})
it('retains records after metadata persistence fails',async()=>{
 responses.push({data:[{id:'c',screenshot_storage_path:'p'}],error:null},{error:{message:'update failed'}})
 await expect(cleanupDeletedExtensionScreenshots()).rejects.toThrow('update failed')
})
