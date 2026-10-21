// Builds the Jev (TypeSafe System One) request that picks a dashboard display
// component for a natural-language question, and validates the answer.
import { z } from 'zod'
import { meta as lineChart } from '../../apps/dashboard/components/LineChart.meta'
import { meta as metricCard } from '../../apps/dashboard/components/MetricCard.meta'
import { meta as statusBreakdown } from '../../apps/dashboard/components/StatusBreakdown.meta'
import type { ComponentMeta } from '../../apps/dashboard/lib/meta'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

const option = (meta: ComponentMeta) => ({
  description: meta.description,
  whenToUse: meta.whenToUse,
  whenNotToUse: meta.whenNotToUse,
})

export const VIEWS = {
  MetricCard: option(metricCard),
  StatusBreakdown: option(statusBreakdown),
  LineChart: option(lineChart),
  // CommentList predates component meta, so its guidance lives here.
  CommentList: {
    description: 'Lists the actual feedback comments, filtered by status.',
    whenToUse: [
      'Use this when the user wants to see, read, or browse the comments themselves.',
      'Use this when the user asks which comments match a status.',
    ],
    whenNotToUse: ['Do not use this when the user only wants a count — use MetricCard instead.'],
  },
}

export const METRICS = {
  unresolved: 'Not finished yet: open, ready for agent, or ready for testing.',
  open: 'New, untriaged feedback only.',
  ready: 'Approved and waiting for an agent.',
  ready_for_testing: 'Agent finished, needs checking.',
  done: 'Resolved or completed.',
  rejected: 'Declined feedback.',
  all: 'Every comment regardless of status.',
}

export const TRENDS = {
  backlog: 'How many comments were in that state on each day (volume, backlog, history).',
  created: 'How many new comments came in on each day (incoming, arrivals, new per day).',
}

export type View = keyof typeof VIEWS
export type Metric = keyof typeof METRICS
export type Trend = keyof typeof TRENDS

const choice = <T extends string>(options: Record<T, unknown>) => z.object({
  choice: z.enum(Object.keys(options) as [T, ...T[]]),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
})
const response = z.object({
  model: z.string(),
  answers: z.object({ view: choice(VIEWS), metric: choice(METRICS), trend: choice(TRENDS) }),
})

export type Decision = z.infer<typeof response>['answers'] & { model: string }

export async function askJev(question: string, { apiKey, model = 'jev-latest' }: { apiKey: string; model?: string }): Promise<Decision> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      state: {
        question,
        availableData: 'Feedback comments with their current workflow status and full status history for the last 30 days.',
      },
      questions: {
        view: { type: 'choice', instructions: 'Which dashboard component best answers the user\'s question?', criteria: VIEWS },
        metric: { type: 'choice', instructions: 'Which set of comments is the user asking about?', criteria: METRICS },
        trend: { type: 'choice', instructions: 'If the answer is shown over time, which daily measure fits?', criteria: TRENDS },
      },
    }),
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Jev request failed (${res.status}): ${JSON.stringify(body)}`)
  const parsed = response.safeParse(body)
  if (!parsed.success) throw new Error(`Unexpected Jev response: ${JSON.stringify(body)}`)
  return { ...parsed.data.answers, model: parsed.data.model }
}
