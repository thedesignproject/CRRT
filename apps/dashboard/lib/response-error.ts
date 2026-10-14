export function responseError(body: string, status: number): Error & { status: number; resource?: string; code?: string } {
  let message = body || `Request failed with ${status}`
  let resource: string | undefined
  let code: string | undefined
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed?.error === 'string' && parsed.error.trim()) message = parsed.error
    else message = `Request failed with ${status}`
    if (typeof parsed?.code === 'string') code = parsed.code
    if (typeof parsed?.resource === 'string') resource = parsed.resource
  } catch { /* Plain-text errors from proxies remain readable. */ }
  return Object.assign(new Error(message), { status, resource, code })
}
