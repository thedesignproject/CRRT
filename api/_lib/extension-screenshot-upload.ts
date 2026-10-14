import type {SupabaseClient} from '@supabase/supabase-js'

/** Bound late writes with expiring Storage permission, not worker lifetime. */
export async function uploadExtensionScreenshot(db:SupabaseClient,actor:string,id:string,path:string,buffer:Buffer,mimeType:string){
  const bucket=db.storage.from('extension-feedback-images')
  const {data,error}=await bucket.createSignedUploadUrl(path,{upsert:false})
  // Preserve duplicate errors so canonical import retries can verify/reuse the
  // already-uploaded object without issuing another write permission.
  if(error)return {data:null,error}
  if(!data)throw new Error('Screenshot upload permission unavailable')
  const payload=JSON.parse(Buffer.from(data.token.split('.')[1], 'base64url').toString()) as {exp?:number}
  if(typeof payload.exp!=='number' || !Number.isFinite(payload.exp))throw new Error('Invalid screenshot upload expiry')
  const {error:registerError}=await db.rpc('register_extension_screenshot_upload',{
    p_actor:actor,p_id:id,p_path:path,p_expires:new Date(payload.exp*1000).toISOString(),
  })
  if(registerError)throw new Error(registerError.message)
  // The token is never returned to the browser. A paused worker cannot start a
  // fresh Storage write after its server-enforced expiry.
  return bucket.uploadToSignedUrl(path,data.token,buffer,{contentType:mimeType,upsert:false})
}
