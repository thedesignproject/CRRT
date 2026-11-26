import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireProjectCapability, requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { createBrainRule, listRulesForUser } from '../../_lib/store.js'

export const RULE_TEXT_ERROR = 'A rule needs a title of 1 to 120 characters and a body of 1 to 4000'
// Trimmed text of 1 to max characters, or null.
export function ruleText(value: unknown, max: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && text.length <= max ? text : null
}

const METHODS = ['GET', 'POST', 'OPTIONS']
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, METHODS)) return
  if (!METHODS.includes(req.method!)) return methodNotAllowed(req, res, METHODS)
  const user = await requireUser(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const rules = await listRulesForUser(user.userId)
      setCors(req, res, METHODS)
      return res.status(200).json({ rules })
    }
    const title = ruleText(req.body?.title, 120), body = ruleText(req.body?.body, 4000)
    if (!title || !body) return jsonError(req, res, 400, RULE_TEXT_ERROR)
    const projectKey = req.body.projectKey ?? null
    if (projectKey !== null && (typeof projectKey !== 'string' || !projectKey)) return jsonError(req, res, 400, 'projectKey must be a project key')
    if (projectKey && !(await requireProjectCapability(req, res, user, projectKey, 'project:manage'))) return
    const rule = await createBrainRule(user.userId, projectKey, title, body)
    setCors(req, res, METHODS)
    return res.status(201).json({ rule })
  } catch (error) {
    console.error('Brain rules request failed', error)
    return jsonError(req, res, 500, 'Unable to load or save rules')
  }
}
