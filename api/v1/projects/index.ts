import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../../_lib/auth.js'
import { handleOptions, jsonError, methodNotAllowed, setCors } from '../../_lib/http.js'
import { listProjectActivity, listProjectsForUser } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res, ['GET', 'OPTIONS'])) return
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS'])
  const user = await requireUser(req, res)
  if (!user) return

  try {
    // Counts are best-effort: without them the dashboard falls back to its own count.
    const activityRead = listProjectActivity(user.userId).catch((error) => {
      console.error('Project activity failed', error)
      return null
    })
    const [projects, activity] = await Promise.all([listProjectsForUser(user.userId), activityRead])
    setCors(req, res, ['GET', 'OPTIONS'])
    if (!activity) return res.status(200).json(projects)
    // Projects whose feedback the user may not read have no activity row.
    return res.status(200).json(projects.map((project) => ({
      ...project,
      ...(activity.get(project.publicKey) ?? { openCount: 0, agentLive: false }),
    })))
  } catch (error) {
    console.error(error)
    return jsonError(req, res, 500, 'Internal server error')
  }
}
