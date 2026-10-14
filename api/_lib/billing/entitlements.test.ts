import { expect,it,vi } from 'vitest'
vi.mock('../supabase.js',()=>({getServiceSupabase:vi.fn()}))
import {getServiceSupabase} from '../supabase.js'
import {ownerEntitlements} from './entitlements.js'
it('reads only the supplied authenticated owner and fails closed on errors or missing data',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{mode:'cloud'},error:null}).mockResolvedValueOnce({data:null,error:{message:'oops'}}).mockResolvedValueOnce({data:null,error:null})
  vi.mocked(getServiceSupabase).mockReturnValue({rpc} as never)
  expect(await ownerEntitlements('owner')).toEqual({mode:'cloud'})
  expect(rpc).toHaveBeenCalledWith('cloud_entitlements',{p_owner:'owner'})
  await expect(ownerEntitlements('owner')).rejects.toThrow('temporarily unavailable')
  await expect(ownerEntitlements('owner')).rejects.toThrow('temporarily unavailable')
})
