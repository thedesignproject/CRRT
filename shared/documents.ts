import { z } from 'zod'

export const documentTarget = z.object({
  selector: z.string().min(1).max(2000),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  elementX: z.number().min(0).max(1),
  elementY: z.number().min(0).max(1),
}).strict()
export type DocumentTarget = z.infer<typeof documentTarget>

const id = z.uuid(),
  version = z.number().int().positive(),
  title = z.string().trim().min(1).max(200)
const body = z
  .string()
  .max(262144)
  .refine((v) => new TextEncoder().encode(v).length <= 262144, 'Document exceeds 256 KiB')
const read = z.object({ id, accessToken: z.string().max(4096).optional() })
const mutation = z.object({ id, key: z.uuid(), expectedVersion: version })
const feedback = z.object({ id, key: z.uuid(), feedbackId: id, feedbackVersion: version })
export const documentSchemas = {
  list: z.object({ action: z.literal('list'), projectId: z.string().min(1).nullable().optional(), scope: z.enum(['all', 'mine']).optional(), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  read: read.extend({ action: z.literal('read'), shareKey: id.optional(), feedbackId: id.optional(), offset: z.number().int().min(0).default(0) }).strict(),
  unlock: z.object({ action: z.literal('unlock'), shareKey: id, password: z.string().max(128) }).strict(),
  history: read.extend({ action: z.literal('history'), offset: z.number().int().min(0).default(0) }).strict(),
  revision: read.extend({ action: z.literal('revision'), revision: version }).strict(),
  compare: read.extend({ action: z.literal('compare'), from: version, to: version.optional() }).strict(),
  create: z.object({ action: z.literal('create'), id, key: z.uuid(), projectId: z.string().min(1).max(200).nullable().optional(), title, body: body.default('') }).strict(),
  save: mutation.extend({ action: z.literal('save'), title, body }).strict(),
  publish: mutation.extend({ action: z.literal('publish'), summary: z.string().trim().min(1).max(1000), agentId: z.string().min(1).max(64).optional(), userRequested: z.literal(true) }).strict(),
  restore: mutation.extend({ action: z.literal('restore'), revision: version }).strict(),
  sharing: mutation
    .extend({
      action: z.literal('sharing'),
      accessMode: z.enum(['private', 'project', 'link', 'password']).optional(),
      sharing: z.boolean().optional(),
      password: z.string().min(8).max(128).nullable().optional(),
      rotateLink: z.boolean().default(false),
      userRequested: z.literal(true)
    })
    .strict(),
  assign: mutation.extend({ action: z.literal('assign'), projectId: z.string().min(1).max(200).nullable(), userRequested: z.literal(true) }).strict(),
  invite: mutation
    .extend({
      action: z.literal('invite'),
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      remove: z.boolean().default(false),
      userRequested: z.literal(true)
    })
    .strict(),
  archive: mutation.extend({ action: z.literal('archive'), archived: z.boolean(), userRequested: z.literal(true) }).strict(),
  delete: mutation.extend({ action: z.literal('delete'), userRequested: z.literal(true) }).strict(),
  comment: z
    .object({
      action: z.literal('comment'),
      id,
      key: z.uuid(),
      shareKey: id.optional(),
      accessToken: z.string().max(4096).optional(),
      revision: version,
      parentId: id.optional(),
      quote: z.string().max(2000).default(''),
      prefix: z.string().max(64).default(''),
      suffix: z.string().max(64).default(''),
      target: documentTarget.optional(),
      body: z.string().trim().min(1).max(8000),
      author: z.string().trim().min(1).max(100)
    })
    .strict(),
  review: feedback
    .extend({
      action: z.literal('review'),
      reviewStatus: z.enum(['open', 'accepted', 'rejected']),
      implementationStatus: z.enum(['unassigned', 'ready_for_testing', 'done']).optional(),
      userRequested: z.literal(true)
    })
    .strict(),
  progress: feedback.extend({ action: z.literal('progress'), operation: z.enum(['claim', 'start', 'block', 'complete']), agentId: z.string().regex(/^[\w-]{1,64}$/), summary: z.string().trim().min(1).max(2000) }).strict()
}
export type DocumentAction = keyof typeof documentSchemas
export type DocumentInput = { [K in DocumentAction]: z.infer<(typeof documentSchemas)[K]> }[DocumentAction]
export interface DocumentView {
  id: string
  projectId: string | null
  accessMode: 'private' | 'project' | 'link' | 'password'
  canComment: boolean
  title: string
  body: string
  version: number
  publishedRevision: number | null
  shareKey: string
  sharing: boolean
  passwordProtected: boolean
  archived: boolean
  updatedAt: string
  canEdit: boolean
  canPublish: boolean
  canManage: boolean
}
export interface DocumentRevision {
  number: number
  title: string
  body?: string
  summary: string
  actor_id: string
  agent_id: string | null
  created_at: string
}
export interface DocumentProgress {
  operation: 'claim' | 'start' | 'block' | 'complete'
  summary: string
  agentId: string
  createdAt: string
}
export interface DocumentComment {
  id: string
  document_id: string
  revision: number
  parent_id: string | null
  quote: string
  prefix: string
  suffix: string
  target?: DocumentTarget | null
  body: string
  author: string
  review_status: 'open' | 'accepted' | 'rejected'
  implementation_status: string
  claimed_by: string | null
  progress_updates?: DocumentProgress[]
  version: number
  created_at: string
}
export interface DocumentResult {
  document?: DocumentView
  documents?: DocumentView[]
  feedback?: DocumentComment[]
  revisions?: DocumentRevision[]
  revision?: DocumentRevision
  comparison?: { before: string; after: string }
  accessToken?: string
  id?: string
  version?: number
  feedbackId?: string
  nextOffset?: number | null
  invites?: string[]
}
