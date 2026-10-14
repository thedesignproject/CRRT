import {beforeEach,expect,it,vi} from 'vitest'
import {uploadExtensionScreenshot} from './extension-screenshot-upload.js'
const sign=vi.fn(),upload=vi.fn(),rpc=vi.fn()
const db={storage:{from:()=>({createSignedUploadUrl:sign,uploadToSignedUrl:upload})},rpc}
const token=(payload:unknown)=>'h.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.s'
const call=()=>uploadExtensionScreenshot(db as never,'actor','id','actor/id.png',Buffer.from('image'),'image/png')
beforeEach(()=>{vi.resetAllMocks();sign.mockResolvedValue({data:{token:token({exp:Math.floor(Date.now()/1000)+7200})},error:null});rpc.mockResolvedValue({error:null});upload.mockResolvedValue({error:null})})
it('registers the signed permission deadline before any storage write',async()=>{
 await call();expect(sign).toHaveBeenCalledWith('actor/id.png',{upsert:false})
 expect(rpc).toHaveBeenCalledWith('register_extension_screenshot_upload',expect.objectContaining({p_actor:'actor',p_id:'id',p_path:'actor/id.png',p_expires:expect.any(String)}))
 expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0])
 expect(upload).toHaveBeenCalledWith('actor/id.png',expect.any(String),expect.any(Buffer),{contentType:'image/png',upsert:false})
})
it.each([{data:null,error:null}])('never uploads without a signed permission (%j)',async result=>{
 sign.mockResolvedValue(result);await expect(call()).rejects.toThrow('permission unavailable');expect(upload).not.toHaveBeenCalled()
})
it.each([{}, {exp:'bad'}, {exp:null}])('rejects unbounded permission expiry (%j)',async payload=>{
 sign.mockResolvedValue({data:{token:token(payload)},error:null});await expect(call()).rejects.toThrow('Invalid screenshot upload expiry');expect(rpc).not.toHaveBeenCalled()
})
it('does not upload after deletion wins registration',async()=>{
 rpc.mockResolvedValue({error:{message:'feedback_deleted'}});await expect(call()).rejects.toThrow('feedback_deleted');expect(upload).not.toHaveBeenCalled()
})

it('preserves structured duplicate signing errors without registering a new write',async()=>{
 const error={statusCode:'409',message:'The resource already exists'}
 sign.mockResolvedValue({data:null,error});expect(await call()).toEqual({data:null,error})
 expect(rpc).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()
})

it('rejects a numeric expiry that overflows JavaScript date arithmetic',async()=>{
 sign.mockResolvedValue({data:{token:'h.'+Buffer.from('{"exp":1e400}').toString('base64url')+'.s'},error:null})
 await expect(call()).rejects.toThrow('Invalid screenshot upload expiry');expect(rpc).not.toHaveBeenCalled()
})
