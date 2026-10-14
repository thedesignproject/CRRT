import {beforeEach,expect,it,vi}from'vitest'
vi.mock('../supabase.js',()=>({getServiceSupabase:vi.fn()}))
import {getServiceSupabase}from'../supabase.js'
import {importLocalFeedback}from'./import-feedback.js'
const upload=vi.fn(),remove=vi.fn(),rpc=vi.fn(),verify=vi.fn(),sign=vi.fn()
const from=()=>{const q={select:()=>q,eq:()=>q,maybeSingle:verify};return q}
const comment={id:'11111111-1111-4111-8111-111111111111',pageUrl:'https://example.com/#hash',selector:'body',x:1,y:2,body:'Feedback'}
const input={projectId:'project',name:'Local',comments:[comment]}
beforeEach(()=>{vi.resetAllMocks();sign.mockResolvedValue({data:{token:'h.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+7200})).toString('base64url')+'.s'},error:null});verify.mockResolvedValue({data:{id:comment.id},error:null});upload.mockResolvedValue({error:null});remove.mockResolvedValue({error:null});rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[]},error:null});vi.mocked(getServiceSupabase).mockReturnValue({storage:{from:()=>({upload,remove,createSignedUploadUrl:sign,uploadToSignedUrl:(path:string,_token:string,buffer:Buffer,options:unknown)=>upload(path,buffer,options)})},rpc,from}as never)})
it('binds an atomic import to the authenticated actor and normalizes local feedback',async()=>{
 expect(await importLocalFeedback('actor',input)).toEqual({projectId:'project',imported:1})
 expect(rpc).toHaveBeenCalledWith('import_cloud_feedback',expect.objectContaining({p_actor:'actor',p_comments:[expect.objectContaining({pageUrl:'https://example.com/',pageHostname:'example.com',screenshotStoragePath:null})]}))
 expect(upload).not.toHaveBeenCalled()
})
it('imports private screenshots under deterministic actor paths and reuses uploads on retry',async()=>{
 const withImage={...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]}
 rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]},error:null})
 await importLocalFeedback('actor',withImage)
 expect(upload).toHaveBeenCalledWith('actor/imports/'+comment.id+'.png',expect.any(Buffer),{contentType:'image/png',upsert:false})
 upload.mockResolvedValue({error:{statusCode:'409'}});await importLocalFeedback('actor',withImage)
 upload.mockResolvedValue({error:{statusCode:'400',message:'The resource already exists'}});await importLocalFeedback('actor',withImage)
 expect(remove).not.toHaveBeenCalled()
})
it('performs no storage side effects when admission fails or its committed response is lost',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'cloud_plan_limit'}})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('cloud_plan_limit')
 expect(upload).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled()
 rpc.mockRejectedValue(new Error('response lost'))
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('response lost')
 expect(upload).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled()
})
it('fails closed on invalid targets, remote screenshots, failed uploads, missing receipts and bad inputs',async()=>{
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,targetType:'wrong'}]})).rejects.toThrow()
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'https://evil.example/image'}]})).rejects.toThrow('local screenshot')
 rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]},error:null})
 upload.mockResolvedValue({error:{statusCode:500}})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('Screenshot import')
 upload.mockResolvedValue({error:{statusCode:400,message:'Invalid upload'}})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('Screenshot import')
 rpc.mockResolvedValue({data:null,error:null});await expect(importLocalFeedback('actor',input)).rejects.toThrow('receipt')
 await expect(importLocalFeedback('actor',{})).rejects.toThrow()
})

it('does not upload changed screenshots for an already imported UUID',async()=>{
 rpc.mockResolvedValue({data:{projectId:'project',imported:0,screenshots:[]},error:null})
 await importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/webp;base64,aGk='}]})
 expect(upload).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled()
})
it('admits before uploading and never removes an admitted object after a concurrent retry',async()=>{
 const receipt={projectId:'project',imported:1,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]}
 rpc.mockResolvedValue({data:receipt,error:null})
 upload.mockResolvedValueOnce({error:{statusCode:500}}).mockResolvedValueOnce({error:null})
 const image={...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]}
 await expect(importLocalFeedback('actor',image)).rejects.toThrow('retry')
 await importLocalFeedback('actor',image)
 expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0])
 expect(remove).not.toHaveBeenCalled()
})
it.each([{id:'missing',path:'wrong'},{id:comment.id,path:'wrong'}])('rejects invalid screenshot receipts without uploading',async paths=>{
 rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[paths]},error:null})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('Invalid screenshot receipt')
 expect(upload).not.toHaveBeenCalled()
})

it('a failing concurrent import cannot delete the successful request screenshot',async()=>{
 let fail!:(value:unknown)=>void
 rpc.mockImplementationOnce(()=>new Promise(resolve=>{fail=resolve})).mockResolvedValueOnce({data:{projectId:'project',imported:1,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]},error:null})
 const image={...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]}
 const first=importLocalFeedback('actor',{...image,projectId:'forbidden'})
 const failed=expect(first).rejects.toThrow('forbidden')
 await importLocalFeedback('actor',image)
 fail({data:null,error:{message:'forbidden'}})
 await failed
 expect(upload).toHaveBeenCalledTimes(1);expect(remove).not.toHaveBeenCalled()
})

it('normalizes UUID case before generating canonical paths and rejects duplicate IDs before admission',async()=>{
 const upper={...comment,id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',imageUrl:'data:image/png;base64,aGk='}
 const lower=upper.id.toLowerCase(),path='actor/imports/'+lower+'.png'
 rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[{id:lower,path}]},error:null})
 await importLocalFeedback('actor',{...input,comments:[upper]})
 expect(upload).toHaveBeenCalledWith(path,expect.any(Buffer),expect.anything())
 rpc.mockClear();upload.mockClear()
 await expect(importLocalFeedback('actor',{...input,comments:[upper,{...upper,id:lower}]})).rejects.toThrow('Duplicate')
 expect(rpc).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()
})

it('cleans a late upload when deletion wins and retains cleanup failures for retry',async()=>{
 const path='actor/imports/'+comment.id+'.png'
 rpc.mockResolvedValue({data:{projectId:'project',imported:0,screenshots:[{id:comment.id,path}]},error:null})
 let finish!:(value:unknown)=>void
 upload.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const pending=importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})
 const rejected=expect(pending).rejects.toThrow('feedback was deleted')
 await vi.waitFor(()=>expect(upload).toHaveBeenCalledOnce())
 verify.mockResolvedValue({data:null,error:null})
 finish({error:null});await rejected
 expect(remove).toHaveBeenCalledWith([path])
 remove.mockResolvedValue({error:{message:'offline'}})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('cleanup failed')
})
it('does not interpret failed verification as deletion',async()=>{
 rpc.mockResolvedValue({data:{projectId:'project',imported:1,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]},error:null})
 verify.mockResolvedValue({data:null,error:{message:'database unavailable'}})
 await expect(importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).rejects.toThrow('verification failed')
 expect(remove).not.toHaveBeenCalled()
})

it('recovers an already uploaded screenshot when signing itself reports a duplicate',async()=>{
 rpc.mockResolvedValue({data:{projectId:'project',imported:0,screenshots:[{id:comment.id,path:'actor/imports/'+comment.id+'.png'}]},error:null})
 sign.mockResolvedValue({data:null,error:{statusCode:'409',message:'The resource already exists'}})
 expect(await importLocalFeedback('actor',{...input,comments:[{...comment,imageUrl:'data:image/png;base64,aGk='}]})).toEqual({projectId:'project',imported:0})
 expect(verify).toHaveBeenCalledOnce();expect(upload).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled()
})
