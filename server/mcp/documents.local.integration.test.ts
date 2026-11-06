// @vitest-environment node
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createProof, hashProof } from '../../api/_lib/extension-auth-contracts.js'
import { mcpHttp } from './http.js'
import { getServiceSupabase, getNonPersistentSupabase } from '../../api/_lib/supabase.js'
import { executeDocument } from '../../api/_lib/documents.js'
import { mcpHandler } from './transport.js'
import { documentTools } from './documents.js'
import { ALL_SCOPES } from './auth.js'
import { assertLocalMcpTargets } from './local-test-targets.js'
import type { DocumentResult } from '../../shared/documents.js'
const local = process.env.MCP_TEST_LOCAL === '1'
const suite = local ? describe : describe.skip
suite('document lifecycle through a real MCP client and local Supabase', () => {
  if (local) assertLocalMcpTargets(process.env)
  const sql = postgres(process.env.DATABASE_URL || 'postgres://localhost/unused')
  const user = randomUUID(), clientId = randomUUID(), project = `mcp-doc-${randomUUID()}`, id = randomUUID()
  const clients: Client[] = []
  const origin = 'http://127.0.0.1:3001', resource = `${origin}/api/mcp/v1`
  async function connect(scope: string, userId: string = user) {
    const connection = randomUUID(), token = `crrt_mcp_${createProof()}`
    await sql`insert into mcp_connections(id,user_id,client_id,resource,scope) values(${connection},${userId},${clientId},${resource},${scope})`
    await sql`insert into mcp_credentials(hash,connection_id,kind,expires_at) values(${hashProof(token)},${connection},'access',now()+interval '10 minutes')`
    const handler = mcpHandler(documentTools)
    const client = new Client({ name: 'document-local-integration',version:'1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { Authorization:`Bearer ${token}` } }, fetch: async (url,init) => handler(new Request(url,init)) }))
    clients.push(client); return client
  }
  beforeAll(async () => {
    process.env.MCP_ORIGIN = origin
    await sql`insert into auth.users(id,email) values(${user},${`${user}@documents.test`})`
    await sql`insert into projects(public_key,slug,name) values(${project},${project},'MCP documents')`
    await sql`insert into project_members(project_key,user_id,role,is_owner) values(${project},${user},'admin',true)`
    await sql`insert into mcp_clients(id,name,redirect_uris) values(${clientId},'Local documents',${['http://localhost:8765/callback']})`
  })
  afterAll(async () => {
    for (const client of clients) await client.close()
    await sql`delete from documents where created_by=${user}`
    await sql`delete from projects where public_key=${project}`
    await sql`delete from document_operations where actor_id=${user} or document_id=${id}`
    await sql`delete from auth.users where id=${user}`
    await sql`delete from mcp_clients where id=${clientId}`
    await sql.end()
  })
  it('creates, protects, reviews, revises, publishes, restores, and deletes entirely through MCP', async () => {
    const client = await connect(ALL_SCOPES)
    const call = async (name: string, args: object = {}) => {
      const response = await client.callTool({ name, arguments: { id, key: randomUUID(), ...args } })
      expect(response.isError,JSON.stringify(response.content)).not.toBe(true)
      return response.structuredContent as DocumentResult
    }
    const read = async () => {
      const response = await client.callTool({ name:'get_document',arguments:{ id } })
      expect(response.isError,JSON.stringify(response.content)).not.toBe(true)
      return response.structuredContent as DocumentResult
    }
    expect((await call('create_document',{ projectId:project,title:'Proposal',body:'# Review this\n\nOriginal text.' })).id).toBe(id)
    const unrequested = await client.callTool({ name: 'publish_document', arguments: { id, key: randomUUID(), expectedVersion: 1, summary: 'No human request' } })
    expect(unrequested.isError).toBe(true)
    expect((await read()).document!.publishedRevision).toBeNull()
    await call('publish_document',{ expectedVersion:1,summary:'First review',userRequested:true })
    await call('set_document_sharing',{ expectedVersion:2,sharing:true,password:'local review password',userRequested:true })
    const initial = (await read()).document!
    await expect(executeDocument({ action:'read',id,shareKey:initial.shareKey },null)).rejects.toMatchObject({ message:'password_required' })
    const { accessToken } = await executeDocument({ action:'unlock',shareKey:initial.shareKey,password:'local review password' },null)
    expect((await executeDocument({ action:'read',id,shareKey:initial.shareKey,accessToken },null)).document!.body).toContain('Original text')
    const feedback = await call('add_document_comment',{ revision:1,author:'Reviewer',quote:'Original text.',body:'Make this clearer.' })
    await call('review_document_feedback',{ feedbackId:feedback.feedbackId,feedbackVersion:1,reviewStatus:'accepted',userRequested:true })
    await call('update_document_feedback_progress',{ feedbackId:feedback.feedbackId,feedbackVersion:2,agentId:'local-agent',operation:'claim',summary:'Claiming approved feedback.' })
    await call('update_document',{ expectedVersion:3,title:'Proposal',body:'# Review this\n\nClearer text.' })
    const blockKey = randomUUID(), block = { feedbackId:feedback.feedbackId,feedbackVersion:3,agentId:'local-agent',operation:'block',summary:'Need the approved copy.',key:blockKey }
    await call('update_document_feedback_progress',block)
    await call('update_document_feedback_progress',block)
    await call('update_document_feedback_progress',{ feedbackId:feedback.feedbackId,feedbackVersion:4,agentId:'local-agent',operation:'start',summary:'Approved copy received.' })
    await call('update_document_feedback_progress',{ feedbackId:feedback.feedbackId,feedbackVersion:5,agentId:'local-agent',operation:'complete',summary:'Draft ready for review.' })
    const reports=(await read()).feedback![0].progress_updates!
    expect(reports.map(report=>report.summary)).toEqual(['Claiming approved feedback.','Need the approved copy.','Approved copy received.','Draft ready for review.'])
    expect(reports.every(report=>report.agentId==='local-agent')).toBe(true)
    await call('review_document_feedback',{feedbackId:feedback.feedbackId,feedbackVersion:6,reviewStatus:'accepted',implementationStatus:'done',userRequested:true})
    expect((await read()).feedback![0].implementation_status).toBe('done')
    await call('publish_document',{ expectedVersion:4,summary:'Clarify introduction',agentId:'local-agent',userRequested:true })
    const history = await client.callTool({ name:'get_document_history',arguments:{id} })
    expect((history.structuredContent as DocumentResult).revisions).toHaveLength(2)
    const compare = await client.callTool({ name:'compare_document_revisions',arguments:{id,from:1,to:2} })
    expect((compare.structuredContent as DocumentResult).comparison!.after).toContain('Clearer text')
    await call('restore_document_revision',{ expectedVersion:5,revision:1 })
    expect((await read()).document!.body).toContain('Original text')
    await call('set_document_sharing',{ expectedVersion:6,sharing:true,rotateLink:true,userRequested:true })
    const rotatedKey=(await read()).document!.shareKey
    await expect(executeDocument({ action:'read',id,shareKey:rotatedKey,accessToken },null)).rejects.toMatchObject({ status:401 })
    await expect(executeDocument({ action:'read',id,shareKey:initial.shareKey,accessToken },null)).rejects.toMatchObject({status:404})
    await call('archive_document',{ expectedVersion:7,archived:true,userRequested:true })
    await expect(executeDocument({ action:'read',id,accessToken },null)).rejects.toMatchObject({ status:404 })
    await call('delete_document',{ expectedVersion:8,userRequested:true })
    expect(await sql`select * from documents where id=${id}`).toHaveLength(0)
    const readonly = await connect('crrt:read')
    expect((await readonly.listTools()).tools.map(t => t.name)).not.toContain('create_document')
  })
  it('controls standalone assignment, all access modes and invitations through MCP',async()=>{
    const client=await connect(ALL_SCOPES),standalone=randomUUID(),guest=randomUUID()
    await sql`insert into auth.users(id,email) values(${guest},${guest+'@documents.test'})`
    await sql`insert into project_members(project_key,user_id,role) values(${project},${guest},'guest')`
    const call=async(name:string,fields:object)=>{const response=await client.callTool({name,arguments:{id:standalone,key:randomUUID(),...fields}});expect(response.isError,JSON.stringify(response.content)).not.toBe(true);return response.structuredContent as DocumentResult}
    const read=async()=>{const response=await client.callTool({name:'get_document',arguments:{id:standalone}});return (response.structuredContent as DocumentResult).document!}
    const mutate=async(name:string,fields:object)=>call(name,{expectedVersion:(await read()).version,userRequested:true,...fields})
    try{
      await call('create_document',{title:'Personal',body:'Published content'});expect((await read()).projectId).toBeNull()
      await mutate('publish_document',{summary:'First'});await mutate('assign_document_project',{projectId:project});expect((await read()).accessMode).toBe('private')
      await mutate('set_document_sharing',{accessMode:'project'});const doc=await read(),guestActor={userId:guest,email:guest+'@documents.test'}
      expect((await executeDocument({action:'read',id:standalone,shareKey:doc.shareKey},guestActor)).document).toMatchObject({canComment:false,canEdit:false,body:'Published content'})
      await expect(executeDocument({action:'history',id:standalone},guestActor)).rejects.toMatchObject({status:403})
      await expect(executeDocument({action:'comment',id:standalone,key:randomUUID(),revision:1,author:'Guest',body:'No'},guestActor)).rejects.toMatchObject({status:403})
      await mutate('assign_document_project',{projectId:null});expect((await read()).accessMode).toBe('private')
      await mutate('set_document_invitation',{email:guestActor.email});expect((await executeDocument({action:'read',id:standalone},guestActor)).document!.canComment).toBe(true)
      await mutate('set_document_invitation',{email:guestActor.email,remove:true});await expect(executeDocument({action:'read',id:standalone},guestActor)).rejects.toMatchObject({status:403})
      await mutate('set_document_sharing',{accessMode:'link'});expect((await executeDocument({action:'read',id:standalone,shareKey:doc.shareKey},null)).document!.canComment).toBe(true)
      await mutate('set_document_sharing',{accessMode:'password',password:'local password'});await expect(executeDocument({action:'read',id:standalone,shareKey:doc.shareKey},null)).rejects.toMatchObject({status:401})
      const consent=await connect('crrt:read');expect((await consent.listTools()).tools).toHaveLength(0)
      const reader=await connect(ALL_SCOPES);expect((await reader.listTools()).tools).toHaveLength(18)
      await mutate('delete_document',{})
    }finally{await sql`delete from documents where id=${standalone}`;await sql`delete from auth.users where id=${guest}`}
  })
  it('keeps project document access independent from private widget feedback',async()=>{
    const member=randomUUID(),guest=randomUUID(),document=randomUUID(),owner={userId:user,email:user+'@documents.test'}
    for(const person of [member,guest])await sql`insert into auth.users(id,email) values(${person},${person+'@documents.test'})`
    await sql`insert into project_members(project_key,user_id,role) values(${project},${member},'member'),(${project},${guest},'guest')`
    await sql`update projects set widget_private=true,feedback_access='admins' where public_key=${project}`
    const teamMember={userId:member,email:member+'@documents.test'},projectGuest={userId:guest,email:guest+'@documents.test'}
    const call=async(action:string,fields:object,actor=teamMember)=>executeDocument({action,id:document,...(action==='read'?{}:{key:randomUUID()}),...fields},actor)
    try{
      await call('create',{projectId:project,title:'Team document',body:'Published'},owner)
      await call('publish',{expectedVersion:1,summary:'Initial',userRequested:true},owner)
      await call('sharing',{expectedVersion:2,accessMode:'project',userRequested:true},owner)
      await call('save',{expectedVersion:3,title:'Team document',body:'Private draft'})
      expect((await call('read',{},owner)).document!.canEdit).toBe(true)
      expect((await call('read',{},projectGuest)).document).toMatchObject({body:'Published',canEdit:false,canComment:false})
      expect((await executeDocument({action:'list',projectId:project},projectGuest)).documents!.map(d=>d.id)).toContain(document)
      await expect(call('comment',{revision:1,author:'Guest',body:'No'},projectGuest)).rejects.toMatchObject({status:403})
    }finally{
      await sql`delete from documents where id=${document}`;await sql`delete from document_operations where document_id=${document}`
      await sql`update projects set widget_private=false,feedback_access='team' where public_key=${project}`;await sql`delete from auth.users where id=any(${[member,guest]})`
    }
  })
  it('unlocks through private browser approval or an explicitly supplied chat password',async()=>{
    const email=randomUUID()+'@unlock.test',password='Local-unlock-test-password',admin=getServiceSupabase()
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const recipient=created.data.user!.id
    const signed=await getNonPersistentSupabase().auth.signInWithPassword({email,password});expect(signed.error).toBeNull();const session=signed.data.session!.access_token
    const docId=randomUUID(),owner={userId:user,email:user+'@documents.test'},client=await connect(ALL_SCOPES,recipient),other=await connect(ALL_SCOPES,recipient)
    const change=(action:string,fields:object)=>executeDocument({action,id:docId,key:randomUUID(),...fields},owner)
    const call=async(target:Client,name:string,args:Record<string,unknown>)=>target.callTool({name,arguments:args})
    const browser=async(body:object,token=session)=>mcpHttp(new Request(origin+'/api/mcp/document-unlock',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}))
    try{
      await change('create',{title:'Password document',body:'Published for password holders'});await change('publish',{expectedVersion:1,summary:'Initial',userRequested:true});await change('sharing',{expectedVersion:2,accessMode:'password',password:'Shared password',userRequested:true})
      const doc=(await executeDocument({action:'read',id:docId},owner)).document!,read={id:docId,shareKey:doc.shareKey}
      expect((await call(client,'get_document',read)).isError).toBe(true)
      const start=await call(client,'unlock_document',{shareKey:doc.shareKey});expect(start.isError).not.toBe(true);const pending=start.structuredContent as Record<string,string>,fragment=new URLSearchParams(new URL(pending.browserUrl).hash.slice(1)),proof=fragment.get('proof')!,poll={requestId:pending.requestId,pollToken:pending.pollToken}
      expect((await call(other,'unlock_document',poll)).isError).toBe(true);expect((await call(client,'unlock_document',poll)).structuredContent).toMatchObject({status:'pending'})
      const inspect=await browser({action:'inspect',requestId:pending.requestId,proof});expect(inspect.status).toBe(200);expect(await inspect.json()).toMatchObject({clientName:'Local documents',status:'pending'})
      expect((await browser({action:'approve',requestId:pending.requestId,proof,password:'Wrong'})).status).toBe(401)
      const approved=await browser({action:'approve',requestId:pending.requestId,proof,password:'Shared password'});expect(approved.status).toBe(200);expect(await approved.json()).toEqual({status:'approved'})
      const grant=(await call(client,'unlock_document',poll)).structuredContent as Record<string,string>;expect(grant.status).toBe('approved');expect((await call(client,'get_document',{...read,accessToken:grant.accessToken})).structuredContent).toMatchObject({document:{body:'Published for password holders',canEdit:false}})
      expect((await call(other,'get_document',{...read,accessToken:grant.accessToken})).isError).toBe(true);await expect(executeDocument({action:'read',...read,accessToken:grant.accessToken},null)).rejects.toMatchObject({message:'password_required'})
      expect((await call(client,'add_document_comment',{...read,accessToken:grant.accessToken,key:randomUUID(),revision:1,author:'Reader',body:'Password feedback'})).isError).not.toBe(true)
      const direct=(await call(other,'unlock_document',{shareKey:doc.shareKey,password:'Shared password'})).structuredContent as Record<string,string>;expect(direct).toMatchObject({status:'approved'});expect(direct.browserUrl).toBeUndefined();expect((await call(other,'get_document',{...read,accessToken:direct.accessToken})).isError).not.toBe(true)
      await change('sharing',{expectedVersion:3,accessMode:'password',password:'Replacement password',userRequested:true});expect((await call(client,'get_document',{...read,accessToken:grant.accessToken})).isError).toBe(true)
      await sql`update document_unlock_requests set expires_at=now()-interval '1 second' where id=${pending.requestId}`;expect((await call(client,'unlock_document',poll)).isError).toBe(true)
      const again=(await call(other,'unlock_document',{shareKey:doc.shareKey})).structuredContent as Record<string,string>,againProof=new URLSearchParams(new URL(again.browserUrl).hash.slice(1)).get('proof')!;const [request]=await sql`select connection_id from document_unlock_requests where id=${again.requestId}`;await sql`update mcp_connections set revoked_at=now() where id=${request.connection_id}`
      expect((await browser({action:'approve',requestId:again.requestId,proof:againProof,password:'Replacement password'})).status).toBe(403)
    }finally{await client.close();await other.close();await sql`delete from documents where id=${docId}`;await admin.auth.admin.deleteUser(recipient)}
  })

})
