// Minimal stdio MCP server exposing one tool, `ask_jev`, so coding agents can
// route a question through Jev and render the chosen component in the preview.
// Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout; logs go to stderr.
import { createInterface } from 'node:readline'
import { PREVIEW_URL, runJev } from './run'

const TOOL = {
  name: 'ask_jev',
  description: 'Ask Jev which CRRT dashboard component (MetricCard, StatusBreakdown, LineChart, CommentList) answers a question about feedback comments. Returns the decision with confidences and renders the component with mock data at the Jev preview page.',
  inputSchema: {
    type: 'object',
    properties: { question: { type: 'string', description: 'The user\'s question, verbatim.' } },
    required: ['question'],
  },
}

type Request = { jsonrpc: '2.0'; id?: number | string; method: string; params?: Record<string, unknown> }

const send = (message: object) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

async function handle(req: Request) {
  switch (req.method) {
    case 'initialize':
      return {
        protocolVersion: (req.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'jev', version: '0.1.0' },
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: [TOOL] }
    case 'tools/call': {
      const args = (req.params?.arguments ?? {}) as { question?: unknown }
      if (req.params?.name !== TOOL.name || typeof args.question !== 'string' || !args.question.trim()) {
        return { isError: true, content: [{ type: 'text', text: 'ask_jev needs a non-empty "question" string.' }] }
      }
      try {
        const { decision, component } = await runJev(args.question.trim())
        const summary = { component, decision, preview: PREVIEW_URL }
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${req.method}`), { code: -32601 })
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  let req: Request
  try {
    req = JSON.parse(line)
  } catch {
    send({ id: null, error: { code: -32700, message: 'Parse error' } })
    continue
  }
  if (req.id === undefined) continue // notifications (e.g. notifications/initialized) need no reply
  try {
    send({ id: req.id, result: await handle(req) })
  } catch (error) {
    const err = error as Error & { code?: number }
    send({ id: req.id, error: { code: err.code ?? -32603, message: err.message } })
  }
}
