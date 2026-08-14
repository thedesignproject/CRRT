import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getStringQuery, jsonError } from './http.js'

/**
 * Self-host patch — NOT part of upstream CRRT.
 *
 * Vercel's Hobby plan caps a deployment at 12 Serverless Functions. Upstream
 * CRRT ships one file per route under api/v1/**, which is 36 functions on
 * its own. This consolidates them into a handful of functions.
 *
 * Vercel's generic (non-Next.js) file-system router for api/ only supports a
 * SINGLE dynamic segment per file ([param]) — it does not run a multi-segment
 * catch-all ([...param]) outside of a framework's own router, so a request
 * with more than one path segment never reaches a [...param].ts file. Instead,
 * this splits by path DEPTH: one thin router file per number of segments
 * (api/v1/[a].ts, api/v1/[a]/[b].ts, ...), each forwarding into the shared
 * table below, which was proven to work (single dynamic segments already
 * worked fine in the original per-route layout — this only changes how many
 * of them share one function).
 *
 * The original handler modules are untouched, just moved (same relative
 * depth, so their `../../_lib/...` imports still resolve) to
 * api/_v1-handlers/**.
 *
 * To pick up an upstream update:
 *   - Changed file in api/v1/X/Y.ts  -> copy over api/_v1-handlers/X/Y.ts
 *   - New route file                 -> copy it into api/_v1-handlers/... and
 *                                        add one entry to `routes` below
 *   - Removed route file             -> delete it from api/_v1-handlers/...
 *                                        and remove its entry below
 *
 * Matching mirrors Vercel's own filesystem router: static segments always
 * win over a `:param` segment at the same position, so e.g. `projects/claim`
 * doesn't get swallowed by `projects/:projectId`.
 */

type Segment = string | { param: string }
type Handler = (req: VercelRequest, res: VercelResponse) => unknown
type RouteModule = { default: Handler }

interface RouteDef {
  segments: Segment[]
  load: () => Promise<RouteModule>
}

const routes: RouteDef[] = [
  { segments: ['admin', 'me'], load: () => import('../_v1-handlers/admin/me.js') },
  { segments: ['admin', 'projects'], load: () => import('../_v1-handlers/admin/projects.js') },
  { segments: ['admin', 'stats'], load: () => import('../_v1-handlers/admin/stats.js') },
  { segments: ['admin', 'users'], load: () => import('../_v1-handlers/admin/users.js') },

  { segments: ['agent', 'eligibility'], load: () => import('../_v1-handlers/agent/eligibility.js') },
  { segments: ['agent', 'shares', { param: 'slug' }, 'events'], load: () => import('../_v1-handlers/agent/shares/[slug]/events.js') },
  { segments: ['agent', 'shares', { param: 'slug' }, 'ops'], load: () => import('../_v1-handlers/agent/shares/[slug]/ops.js') },
  { segments: ['agent', 'shares', { param: 'slug' }, 'presence'], load: () => import('../_v1-handlers/agent/shares/[slug]/presence.js') },
  { segments: ['agent', 'shares', { param: 'slug' }, 'state'], load: () => import('../_v1-handlers/agent/shares/[slug]/state.js') },

  { segments: ['comments', { param: 'commentId' }, 'github-issue'], load: () => import('../_v1-handlers/comments/[commentId]/github-issue.js') },
  { segments: ['comments', { param: 'commentId' }, 'implementation-status'], load: () => import('../_v1-handlers/comments/[commentId]/implementation-status.js') },
  { segments: ['comments', { param: 'commentId' }, 'review-status'], load: () => import('../_v1-handlers/comments/[commentId]/review-status.js') },

  { segments: ['feedback-shares', { param: 'shareId' }, 'prompt'], load: () => import('../_v1-handlers/feedback-shares/[shareId]/prompt.js') },
  { segments: ['feedback-shares'], load: () => import('../_v1-handlers/feedback-shares/index.js') },

  { segments: ['github', 'setup'], load: () => import('../_v1-handlers/github/setup.js') },

  { segments: ['invites', 'accept'], load: () => import('../_v1-handlers/invites/accept.js') },
  { segments: ['invites', 'decline'], load: () => import('../_v1-handlers/invites/decline.js') },
  { segments: ['invites'], load: () => import('../_v1-handlers/invites/index.js') },

  { segments: ['notifications', { param: 'notificationId' }, 'read'], load: () => import('../_v1-handlers/notifications/[notificationId]/read.js') },
  { segments: ['notifications'], load: () => import('../_v1-handlers/notifications/index.js') },
  { segments: ['notifications', 'read-all'], load: () => import('../_v1-handlers/notifications/read-all.js') },

  { segments: ['projects', { param: 'projectId' }, 'comments'], load: () => import('../_v1-handlers/projects/[projectId]/comments.js') },
  { segments: ['projects', { param: 'projectId' }, 'github', 'install'], load: () => import('../_v1-handlers/projects/[projectId]/github/install.js') },
  { segments: ['projects', { param: 'projectId' }, 'invites'], load: () => import('../_v1-handlers/projects/[projectId]/invites.js') },
  { segments: ['projects', { param: 'projectId' }, 'members', { param: 'userId' }], load: () => import('../_v1-handlers/projects/[projectId]/members/[userId].js') },
  { segments: ['projects', { param: 'projectId' }, 'members'], load: () => import('../_v1-handlers/projects/[projectId]/members.js') },
  { segments: ['projects', { param: 'projectId' }, 'repo-config'], load: () => import('../_v1-handlers/projects/[projectId]/repo-config.js') },
  { segments: ['projects', 'availability'], load: () => import('../_v1-handlers/projects/availability.js') },
  { segments: ['projects', 'claim'], load: () => import('../_v1-handlers/projects/claim.js') },
  { segments: ['projects', { param: 'projectId' }], load: () => import('../_v1-handlers/projects/[projectId]/index.js') },
  { segments: ['projects'], load: () => import('../_v1-handlers/projects/index.js') },

  { segments: ['public', 'comments'], load: () => import('../_v1-handlers/public/comments.js') },
  { segments: ['public', 'project'], load: () => import('../_v1-handlers/public/project.js') },

  { segments: ['shares', { param: 'slug' }, 'prompt'], load: () => import('../_v1-handlers/shares/[slug]/prompt.js') },

  { segments: ['widget', 'github', 'callback'], load: () => import('../_v1-handlers/widget/github/callback.js') },
  { segments: ['widget', 'github', 'login'], load: () => import('../_v1-handlers/widget/github/login.js') },
]

function matchRoute(pathSegments: string[]): { route: RouteDef; params: Record<string, string> } | null {
  let best: { route: RouteDef; params: Record<string, string>; score: number } | null = null

  for (const route of routes) {
    if (route.segments.length !== pathSegments.length) continue

    const params: Record<string, string> = {}
    let score = 0
    let ok = true

    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i]
      const actual = pathSegments[i]
      if (typeof seg === 'string') {
        if (seg !== actual) {
          ok = false
          break
        }
        score += 1
      } else {
        params[seg.param] = actual
      }
    }

    if (ok && (!best || score > best.score)) {
      best = { route, params, score }
    }
  }

  return best ? { route: best.route, params: best.params } : null
}

const SEGMENT_KEYS = ['seg1', 'seg2', 'seg3', 'seg4'] as const

/**
 * Reads exactly `depth` segments (seg1..segN) off req.query. `depth` must
 * match the calling file's own nesting — api/v1/[seg1].ts passes 1,
 * [seg1]/[seg2].ts passes 2, etc. — so req.query can't be confused by a
 * caller-supplied `?seg2=...` querystring value on a shallower route.
 */
export async function dispatchV1(req: VercelRequest, res: VercelResponse, depth: 1 | 2 | 3 | 4) {
  const pathSegments = SEGMENT_KEYS
    .slice(0, depth)
    .map((key) => getStringQuery(req.query[key]))

  if (pathSegments.some((s) => s === undefined)) {
    return jsonError(req, res, 404, 'Not found')
  }

  const match = matchRoute(pathSegments as string[])
  if (!match) {
    return jsonError(req, res, 404, 'Not found')
  }

  for (const [key, value] of Object.entries(match.params)) {
    req.query[key] = value
  }

  const mod = await match.route.load()
  return mod.default(req, res)
}
