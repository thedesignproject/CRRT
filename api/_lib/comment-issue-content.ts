import type { GithubIssueComment, GithubIssueContent } from './github-issues.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const MAX_TITLE = 120
const MAX_SUMMARY = 1_000
const MAX_CONTEXT = 2_000
const MAX_AI_FEEDBACK = 8_000
const MAX_AI_SELECTOR = 1_000
const MAX_AI_ANCHOR_TEXT = 2_000
const MAX_AI_ATTEMPTS = 4

const CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'implementationContext'],
  properties: {
    title: { type: 'string', maxLength: MAX_TITLE },
    summary: { type: 'string', maxLength: MAX_SUMMARY },
    implementationContext: { type: 'string', maxLength: MAX_CONTEXT },
  },
} as const

const SYSTEM_PROMPT = [
  'Generate concise, concrete, implementation-oriented content from the supplied feedback.',
  'Return exactly one JSON object matching this schema:',
  JSON.stringify(CONTENT_SCHEMA),
  'Every value must be a JSON string. Do not return markdown, nested objects, arrays, or extra keys.',
  'Do not invent missing context.',
].join('\n')

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function fallbackContent(comment: GithubIssueComment): GithubIssueContent {
  const normalized = comment.body.trim().replace(/\s+/g, ' ')
  const short = normalized.slice(0, 72)
  return {
    title: short ? `Feedback: ${short}`.slice(0, MAX_TITLE) : 'Address visual feedback',
    summary: normalized.slice(0, MAX_SUMMARY)
      || 'Address the accepted visual feedback captured by CRRT.',
    implementationContext: [
      'Review the feedback and the captured page and element context.',
      'Implement the smallest change that addresses the request, then verify the affected UI.',
    ].join(' '),
  }
}

function safePageUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function aiEndpoint() {
  const raw = process.env.AI_API_BASE_URL?.trim() || DEFAULT_BASE_URL
  const url = new URL(raw)
  const localHttp = url.protocol === 'http:'
    && (
      url.hostname === '127.0.0.1'
      || url.hostname === 'localhost'
      || url.hostname === '[::1]'
    )
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && localHttp)) {
    throw new Error('invalid_ai_api_base_url')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function aiInput(comment: GithubIssueComment) {
  const anchor = comment.anchor
    ? Object.fromEntries([
        ['selectedText', MAX_AI_ANCHOR_TEXT],
        ['prefix', 64],
        ['suffix', 64],
        ['containerSelector', MAX_AI_SELECTOR],
      ].flatMap(([key, limit]) => {
        const value = cleanText(comment.anchor?.[key as string], limit as number)
        return value ? [[key, value]] : []
      }))
    : null
  const context: Record<string, unknown> = {
    feedback: cleanText(comment.body, MAX_AI_FEEDBACK),
    pageUrl: safePageUrl(comment.pageUrl),
    selector: cleanText(comment.selector, MAX_AI_SELECTOR) || null,
    targetType: comment.targetType,
    anchor,
  }
  return JSON.stringify(context)
}

function parseContent(value: unknown): GithubIssueContent | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (
      Object.keys(parsed).sort().join(',')
      !== 'implementationContext,summary,title'
    ) return null
    const title = cleanText(parsed.title, MAX_TITLE)
    const summary = cleanText(parsed.summary, MAX_SUMMARY)
    const implementationContext = cleanText(parsed.implementationContext, MAX_CONTEXT)
    return title && summary && implementationContext
      ? { title, summary, implementationContext }
      : null
  } catch {
    return null
  }
}

export async function generateCommentIssueContent(comment: GithubIssueComment) {
  const fallback = fallbackContent(comment)
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()
  if (!apiKey || !model) return fallback

  try {
    const endpoint = aiEndpoint()
    const userContent = aiInput(comment)
    for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8_000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              ...(attempt === 0 ? [] : [{
                role: 'system',
                content: 'The previous response was invalid. Follow the schema exactly; all three fields must be strings.',
              }]),
              { role: 'user', content: userContent },
            ],
          }),
        })
        if (!response.ok) continue
        const body = await response.json() as {
          choices?: Array<{ message?: { content?: unknown } }>
        }
        const content = parseContent(body.choices?.[0]?.message?.content)
        if (content) return content
      } catch {
        // Retry bounded provider, timeout, JSON, and schema failures.
      }
    }
    return fallback
  } catch {
    return fallback
  }
}
