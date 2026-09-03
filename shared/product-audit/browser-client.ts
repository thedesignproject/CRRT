import {
  auditCapabilitiesSchema,
  auditCreateResponseSchema,
  auditEventsResponseSchema,
  auditRunResponseSchema,
  type AuditCapabilities,
  type AuditCreateResponse,
  type AuditEventsResponse,
  type AuditRunResponse,
} from './contracts.js'
const SESSION_KEY = 'crrt:audit:session'
const TOKEN_PREFIX = 'crrt:audit:capability:'
type StoredCapability = { token: string; expiresAt: string }
let memorySession: string | undefined
const memoryCapabilities = new Map<string, StoredCapability>()
function endpoint(apiBase: string, path: string) {
  return `${apiBase.replace(/\/$/, '')}/v1/audits${path}`
}
function storage() {
  try { return window.localStorage } catch { return null }
}
function readStored(key: string) {
  try { return storage()?.getItem(key) || undefined } catch { return undefined }
}
function writeStored(key: string, value: string) {
  try { storage()?.setItem(key, value) } catch { /* memory remains authoritative for this page */ }
}
function removeStored(key: string) {
  try { storage()?.removeItem(key) } catch { /* storage is optional */ }
}
function readSession() {
  return readStored(SESSION_KEY) || memorySession
}
export function readAuditCapability(auditId: string): string | undefined {
  const key = `${TOKEN_PREFIX}${auditId}`
  const raw = readStored(key)
  try {
    const value = raw ? JSON.parse(raw) as StoredCapability : memoryCapabilities.get(auditId)
    if (!value) return undefined
    if (new Date(value.expiresAt).getTime() <= Date.now()) {
      memoryCapabilities.delete(auditId)
      removeStored(key)
      return undefined
    }
    return value.token
  } catch {
    memoryCapabilities.delete(auditId)
    removeStored(key)
    return undefined
  }
}
async function request<T>(url: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `Request failed with ${response.status}`
    throw new Error(message)
  }
  return schema.parse(body)
}
export function getAuditCapabilities(apiBase: string, signal?: AbortSignal): Promise<AuditCapabilities> {
  return request(endpoint(apiBase, '/capabilities'), auditCapabilitiesSchema, { signal })
}
export async function createAudit(
  apiBase: string,
  input: { url: string; projectKey?: string; accessToken?: string },
): Promise<AuditCreateResponse> {
  const anonymous = !input.projectKey
  const response = await request(endpoint(apiBase, ''), auditCreateResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      ...(anonymous && readSession() ? { 'X-Audit-Session': readSession()! } : {}),
      ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    },
    body: JSON.stringify({ url: input.url, ...(input.projectKey ? { projectKey: input.projectKey } : {}) }),
  })
  if (response.sessionToken) {
    memorySession = response.sessionToken
    writeStored(SESSION_KEY, response.sessionToken)
  }
  if (response.auditToken && response.expiresAt) {
    const value = { token: response.auditToken, expiresAt: response.expiresAt } satisfies StoredCapability
    memoryCapabilities.set(response.auditId, value)
    writeStored(`${TOKEN_PREFIX}${response.auditId}`, JSON.stringify(value))
  }
  return response
}
function auditHeaders(auditId: string, accessToken?: string) {
  const token = accessToken ? undefined : readAuditCapability(auditId)
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(token ? { 'X-Audit-Token': token } : {}),
  }
}
export function getAudit(apiBase: string, auditId: string, accessToken?: string, signal?: AbortSignal): Promise<AuditRunResponse> {
  return request(endpoint(apiBase, `/${encodeURIComponent(auditId)}`), auditRunResponseSchema, { headers: auditHeaders(auditId, accessToken), signal })
}
export function getAuditEvents(apiBase: string, auditId: string, after: string, accessToken?: string, signal?: AbortSignal): Promise<AuditEventsResponse> {
  return request(endpoint(apiBase, `/${encodeURIComponent(auditId)}/events?after=${encodeURIComponent(after)}&limit=100`), auditEventsResponseSchema, { headers: auditHeaders(auditId, accessToken), signal })
}
export function cancelAudit(apiBase: string, auditId: string, accessToken?: string): Promise<AuditRunResponse> {
  return request(endpoint(apiBase, `/${encodeURIComponent(auditId)}/cancel`), auditRunResponseSchema, { method: 'POST', headers: auditHeaders(auditId, accessToken) })
}
