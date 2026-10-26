// Deterministic fake feedback for the Jev preview. Every comment carries a full
// status history, so counts, lists, and daily trends all agree with each other.
import { dailyCounts, unresolvedCount, type DailyPoint, type StatusCounts } from '../../apps/dashboard/lib/metrics'
import { AUTHOR_COLORS, DISPLAY_STATUS_LABELS, type Comment, type DisplayStatus, type ImplStatus, type ReviewStatus } from '../../apps/dashboard/lib/types'
import type { Decision, Metric } from './decide'

const DAY_MS = 86_400_000
const DAYS = 30
const PROJECT = { id: 'proj_acme_marketing', name: 'Acme Marketing Site', origin: 'https://acme.com' }
const AUTHORS = ['Tomas', 'Pranav', 'Dianne', 'Lara', 'Agustin', 'María']
const PAGES = ['/', '/pricing', '/blog', '/signup', '/docs/getting-started', '/about']
const BODIES = [
  'The hero CTA wraps onto two lines on mobile.',
  'Pricing toggle loses focus ring after click.',
  'Footer links are too low contrast on dark background.',
  'Signup form error message overlaps the password field.',
  'Blog cards have inconsistent image heights.',
  'Nav dropdown closes before I can reach the submenu.',
  'Testimonial carousel autoplays too fast to read.',
  'Docs code block overflows horizontally on tablet.',
  'Missing alt text on the team photos.',
  'Annual plan badge says 20% but math shows 17%.',
  'Cookie banner covers the chat launcher.',
  'Headline font jumps in after load (FOUT).',
]

type Change = { status: DisplayStatus; at: number }
type MockComment = { id: string; body: string; author: string; page: string; history: Change[] }

// mulberry32: small seeded PRNG so every run sees the same dataset.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function mockComments(now = Date.now()): MockComment[] {
  const rand = random(42)
  const start = now - DAYS * DAY_MS
  const comments: MockComment[] = []
  for (let day = 0; day < DAYS; day++) {
    // Steady trickle with a launch-week spike around day 18.
    const arrivals = Math.round(1 + rand() * 3 + (day >= 17 && day <= 20 ? 6 : 0))
    for (let n = 0; n < arrivals; n++) {
      const created = start + day * DAY_MS + rand() * DAY_MS
      const history: Change[] = [{ status: 'open', at: created }]
      let at = created + (0.5 + rand() * 4) * DAY_MS
      if (rand() < 0.1) history.push({ status: 'rejected', at })
      else if (rand() < 0.85) {
        history.push({ status: 'ready', at })
        at += (0.5 + rand() * 3) * DAY_MS
        if (rand() < 0.8) {
          history.push({ status: 'ready_for_testing', at })
          at += (0.5 + rand() * 2) * DAY_MS
          if (rand() < 0.8) history.push({ status: 'done', at })
        }
      }
      comments.push({
        id: `mock-${comments.length + 1}`,
        body: BODIES[Math.floor(rand() * BODIES.length)],
        author: AUTHORS[Math.floor(rand() * AUTHORS.length)],
        page: PAGES[Math.floor(rand() * PAGES.length)],
        history: history.filter((change) => change.at <= now),
      })
    }
  }
  return comments
}

function statusAt(comment: MockComment, at: number): DisplayStatus | null {
  let status: DisplayStatus | null = null
  for (const change of comment.history) if (change.at <= at) status = change.status
  return status
}

const UNRESOLVED: DisplayStatus[] = ['open', 'ready', 'ready_for_testing']
const matches = (metric: Metric, status: DisplayStatus | null) =>
  status !== null && (metric === 'all' || status === metric || (metric === 'unresolved' && UNRESOLVED.includes(status)))

const label = (metric: Metric) => metric === 'unresolved' ? 'Unresolved' : metric === 'all' ? 'All' : DISPLAY_STATUS_LABELS[metric]

const STORED: Record<DisplayStatus, { reviewStatus: ReviewStatus; implementationStatus: ImplStatus }> = {
  open: { reviewStatus: 'open', implementationStatus: 'unassigned' },
  ready: { reviewStatus: 'accepted', implementationStatus: 'unassigned' },
  ready_for_testing: { reviewStatus: 'accepted', implementationStatus: 'ready_for_testing' },
  done: { reviewStatus: 'accepted', implementationStatus: 'done' },
  rejected: { reviewStatus: 'rejected', implementationStatus: 'unassigned' },
}

function toComment(mock: MockComment, status: DisplayStatus): Comment {
  const last = mock.history[mock.history.length - 1]
  return {
    id: mock.id,
    projectId: PROJECT.id,
    pageUrl: `${PROJECT.origin}${mock.page}`,
    selector: 'main',
    x: 0,
    y: 0,
    body: mock.body,
    ...STORED[status],
    claimedByAgentId: null,
    createdAt: new Date(mock.history[0].at).toISOString(),
    updatedAt: new Date(last.at).toISOString(),
    author: mock.author,
    authorInitial: mock.author[0],
    authorColor: AUTHOR_COLORS[AUTHORS.indexOf(mock.author) % AUTHOR_COLORS.length],
    screenshotUrl: null,
    targetType: 'element_point',
    anchor: null,
    githubIssue: null,
  }
}

export type Rendered =
  | { component: 'MetricCard'; props: { label: string; value: number; detail: string } }
  | { component: 'StatusBreakdown'; props: { title: string; counts: StatusCounts } }
  | { component: 'LineChart'; props: { title: string; points: DailyPoint[]; summary?: 'total' | 'latest' } }
  | { component: 'CommentList'; props: { comments: Comment[]; counts: StatusCounts & { all: number } } }

/** Turns Jev's decision into the chosen component's props, backed by the mock dataset. */
export function buildProps(decision: Pick<Decision, 'view' | 'metric' | 'trend'>, now = Date.now()): Rendered {
  const all = mockComments(now)
  const counts: StatusCounts = { open: 0, ready: 0, ready_for_testing: 0, done: 0, rejected: 0 }
  for (const c of all) counts[statusAt(c, now)!]++
  const metric = decision.metric.choice
  const current = all.filter((c) => matches(metric, statusAt(c, now)))

  switch (decision.view.choice) {
    case 'MetricCard': {
      const value = metric === 'unresolved' ? unresolvedCount(counts) : metric === 'all' ? all.length : counts[metric]
      return { component: 'MetricCard', props: { label: `${label(metric)} comments`, value, detail: `${PROJECT.name} · as of today` } }
    }
    case 'StatusBreakdown':
      return { component: 'StatusBreakdown', props: { title: `Comments by status · ${PROJECT.name}`, counts } }
    case 'LineChart': {
      if (decision.trend.choice === 'created') {
        return {
          component: 'LineChart',
          props: {
            title: `New ${metric === 'all' ? '' : `${label(metric).toLowerCase()} `}comments per day, last ${DAYS} days`,
            points: dailyCounts(current.map((c) => new Date(c.history[0].at).toISOString()), DAYS, new Date(now)),
          },
        }
      }
      const days = dailyCounts([], DAYS, new Date(now))
      return {
        component: 'LineChart',
        props: {
          title: `${label(metric)} comments each day, last ${DAYS} days`,
          summary: 'latest',
          points: days.map(({ date }) => {
            const endOfDay = Math.min(now, Date.parse(`${date}T00:00:00Z`) + DAY_MS - 1)
            return { date, value: all.filter((c) => matches(metric, statusAt(c, endOfDay))).length }
          }),
        },
      }
    }
    case 'CommentList':
      return {
        component: 'CommentList',
        props: {
          comments: current
            .sort((a, b) => b.history[0].at - a.history[0].at)
            .map((c) => toComment(c, statusAt(c, now)!)),
          counts: { all: current.length, ...counts },
        },
      }
  }
}
