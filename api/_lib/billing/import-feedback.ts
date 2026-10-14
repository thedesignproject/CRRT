import {uploadExtensionScreenshot} from '../extension-screenshot-upload.js'
import { z } from 'zod'
import { parseCommentTarget } from '../anchor.js'
import { normalizeExtensionPageUrl, parseScreenshot } from '../extension-comments.js'
import { getServiceSupabase } from '../supabase.js'

const localComment = z.object({
  id:z.string().uuid(),pageUrl:z.string().max(2048),selector:z.string().trim().min(1).max(1000),
  x:z.number().finite(),y:z.number().finite(),body:z.string().trim().min(1).max(5000),
  authorName:z.string().max(100).optional(),reviewStatus:z.enum(['open','accepted','rejected']).optional(),
  targetType:z.unknown().optional(),anchor:z.unknown().optional(),
  imageUrl:z.string().max(3_000_000).nullable().optional(),
})
export const importRequest = z.object({
  projectId:z.string().max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name:z.string().trim().min(1).max(80),comments:z.array(localComment).max(50),
})
export async function importLocalFeedback(actorId:string,raw:unknown) {
  const input=importRequest.parse(raw)
  const db=getServiceSupabase()
  const bucket=db.storage.from('extension-feedback-images')
  const images = new Map<string, {path:string;screenshot:NonNullable<ReturnType<typeof parseScreenshot>>}>()
  const ids = new Set<string>()
  const comments = input.comments.map(rawComment => {
    const comment={...rawComment,id:rawComment.id.toLowerCase()}
    if(ids.has(comment.id))throw new Error('Duplicate local feedback ID')
    ids.add(comment.id)
    const normalized=normalizeExtensionPageUrl(comment.pageUrl)
    const target=parseCommentTarget(comment.targetType,comment.anchor)
    if(!target.ok)throw new Error(target.error)
    let screenshotStoragePath:string|null=null
    if(comment.imageUrl){
      const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(comment.imageUrl)
      if(!match)throw new Error('Only local screenshot data can be imported')
      const screenshot=parseScreenshot({mimeType:match[1],base64:match[2]})!
      screenshotStoragePath=`${actorId}/imports/${comment.id}.${match[1].split('/')[1]}`
      images.set(comment.id,{path:screenshotStoragePath,screenshot})
    }
    return {...comment,...normalized,...target,screenshotStoragePath}
  })
  // Commit admission and canonical paths before any storage side effect. An
  // uncertain RPC outcome performs no upload/deletion; retry recovers its receipt.
  const {data,error}=await db.rpc('import_cloud_feedback',{
    p_actor:actorId,p_project:input.projectId,p_name:input.name,p_comments:comments,
  })
  if(error)throw new Error(error.message)
  if(!data)throw new Error('Import did not return a receipt')
  const receipt=data as {projectId:string;imported:number;screenshots:{id:string;path:string}[]}
  for(const admitted of receipt.screenshots){
    const image=images.get(admitted.id)
    if(!image || image.path!==admitted.path)throw new Error('Invalid screenshot receipt')
    const {error:uploadError}=await uploadExtensionScreenshot(db,actorId,admitted.id,admitted.path,image.screenshot.buffer,image.screenshot.mimeType)
    const duplicate=uploadError && (String(uploadError.statusCode)==='409' || /already exists/i.test(uploadError.message))
    // A completed upload precedes this check. If deletion commits later its
    // cleanup removes the object; if it committed earlier we remove it here.
    // Query failures are unknown, never permission to delete a live asset.
    const {data:live,error:verifyError}=await db.from('comments').select('id')
      .eq('id',admitted.id).eq('source','extension').eq('created_by_user_id',actorId)
      .eq('screenshot_storage_path',admitted.path).maybeSingle()
    if(verifyError)throw new Error('Screenshot verification failed; retry')
    if(!live){
      const {error:removeError}=await bucket.remove([admitted.path])
      if(removeError)throw new Error('Deleted screenshot cleanup failed; retry')
      throw new Error('Imported feedback was deleted')
    }
    if(uploadError && !duplicate)throw new Error('Screenshot import failed; retry to complete the admitted comment')
  }
  // Only confirmed deletion permits removal. Durable deletion records are
  // swept repeatedly to recover crashes and uncertain storage responses.
  return {projectId:receipt.projectId,imported:receipt.imported}
}
