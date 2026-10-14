import type {VercelRequest,VercelResponse} from '@vercel/node'
import {requireUser} from '../../_lib/auth.js'
import {importLocalFeedback,importRequest} from '../../_lib/billing/import-feedback.js'
import {handleOptions,jsonError,methodNotAllowed,setCors} from '../../_lib/http.js'
const METHODS=['POST','OPTIONS']
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(handleOptions(req,res,METHODS))return
  if(req.method!=='POST')return methodNotAllowed(req,res,METHODS)
  const user=await requireUser(req,res)
  if(!user)return
  const parsed=importRequest.safeParse(req.body)
  if(!parsed.success)return jsonError(req,res,400,'Invalid local feedback import')
  try{
    const result=await importLocalFeedback(user.userId,parsed.data)
    setCors(req,res,METHODS)
    return res.status(200).json(result)
  }catch(error){
    return jsonError(req,res,409,'Local feedback was retained. Import could not complete; check the destination and plan, then retry.',error)
  }
}
