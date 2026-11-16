// Each production worker gets a fresh, non-persistent sandbox. Publish this
// marker atomically only after its one-shot pass has finished all awaited work.
export const WORKER_COMPLETION_FILE = '/vercel/sandbox/record-worker.complete'
export const WORKER_COMPLETION_CONTENT = 'record-worker-complete-v1\n'

// Error messages can carry URLs, keys, or customer data. Worker logs keep only
// short identifier-like class names, codes, and handle types.
function safe(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : 'unknown'
}

export function workerFailureLog(error: unknown) {
  const { name, code } = Object(error) as { name?: unknown; code?: unknown }
  return `record_worker_failed type=${safe(name)} code=${safe(code)}`
}

// Handle types (for example Timeout or TCPSocketWrap) show what could keep a
// finished one-shot process alive, without addresses or payloads.
export function workerCompletionLog(resources: string[]) {
  const counts = new Map<string, number>()
  for (const resource of resources) counts.set(safe(resource), (counts.get(safe(resource)) ?? 0) + 1)
  const summary = [...counts].map(([type, count]) => `${type}:${count}`).sort().join(',')
  return `record_worker_complete active_resources=${summary || 'none'}`
}
