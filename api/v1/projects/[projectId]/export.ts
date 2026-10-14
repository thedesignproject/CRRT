import type {VercelRequest,VercelResponse} from '@vercel/node'
import {requireProjectCapability,requireUser} from '../../../_lib/auth.js'
import {getServiceSupabase} from '../../../_lib/supabase.js'
import {getStringQuery,handleOptions,jsonError,methodNotAllowed,setCors} from '../../../_lib/http.js'
const METHODS=['GET','OPTIONS']
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(handleOptions(req,res,METHODS))return
  if(req.method!=='GET')return methodNotAllowed(req,res,METHODS)
  const user=await requireUser(req,res)
  if(!user)return
  const project=getStringQuery(req.query.projectId)
  if(!project)return jsonError(req,res,400,'Missing projectId')
  if(!await requireProjectCapability(req,res,user,project,'feedback:read'))return
  try{
    const comments:unknown[]=[]
    let cursor:string|undefined
    while(true){
      // The existing read RPC enforces guest/private feedback scope. No paid gate on export.
      let page=getServiceSupabase().rpc('read_project_feedback',{p_project:project,p_actor:user.userId}).order('id').limit(1000)
      if(cursor)page=page.gt('id',cursor)
      const {data,error}=await page
      if(error)throw new Error(error.message)
      comments.push(...data)
      if(data.length<1000)break
      cursor=data[data.length-1].id
    }
    setCors(req,res,METHODS);res.setHeader('Cache-Control','no-store')
    res.setHeader('Content-Disposition','attachment; filename="crrt-feedback.json"')
    return res.status(200).json({version:1,projectId:project,exportedAt:new Date().toISOString(),comments})
  }catch(error){return jsonError(req,res,503,'Feedback export is temporarily unavailable',error)}
}
