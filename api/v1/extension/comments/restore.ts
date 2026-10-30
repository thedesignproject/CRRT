import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { requireUser, requireProjectCapability } from '../../../_lib/auth.js'
import { getServiceSupabase } from '../../../_lib/supabase.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../../_lib/http.js'
const request = z.object({ projectId:z.string().trim().min(1).max(200), items:z.array(z.object({id:z.uuid(),updatedAt:z.iso.datetime({offset:true})})).min(1).max(500) })
const methods=['POST','OPTIONS']
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(handleOptions(req,res,methods))return
 if(req.method!=='POST')return methodNotAllowed(req,res,methods)
 const user=await requireUser(req,res);if(!user)return
 const parsed=request.safeParse(req.body)
 if(!parsed.success)return jsonError(req,res,400,'A project and 1–500 versioned items are required')
 const {projectId,items}=parsed.data
 if(new Set(items.map(item=>item.id)).size!==items.length)return jsonError(req,res,400,'Duplicate items')
 try{
  if(!await requireProjectCapability(req,res,user,projectId,'feedback:manage'))return
  const {data,error}=await getServiceSupabase().rpc('restore_actor_inbox_feedback',{
   p_actor:user.userId,p_project:projectId,p_items:items.map(item=>({id:item.id,updated_at:item.updatedAt})),
  })
  if(error)throw new Error(error.message)
  const processedIds=((data as Array<{id:string}>|null)??[]).map(row=>row.id)
  const restored=new Set(processedIds)
  setCors(req,res,methods)
  return res.status(200).json({processedIds,skipped:items.filter(item=>!restored.has(item.id)).map(item=>({id:item.id,reason:'concurrent_change'}))})
 }catch(error){
  if(error instanceof Error&&error.message==='forbidden')return jsonError(req,res,403,'Project access changed. Refresh before undoing.')
  return jsonError(req,res,500,'Could not return feedback to Inbox',error)
 }
}
