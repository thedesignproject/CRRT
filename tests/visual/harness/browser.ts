import { comments, fixedTime, project } from '../fixtures/data'
const state = new URLSearchParams(location.search).get('state') ?? ''
const signedIn = !['signed-out', 'disclosure', 'local-populated', 'local-limit', 'auth-busy', 'auth-error', 'background-error', 'injected-local'].includes(state)
const session = signedIn ? { accessToken: 'visual-token', email: 'reviewer@example.test' } : null
const count = state === 'local-limit' ? 50 : state === 'local-populated' || state.startsWith('import') || state === 'local-expanded' || state === 'injected-local' ? 3 : 0
const storage: Record<string, unknown> = {
  'crrt:disclosure-version': state === 'disclosure' ? undefined : 1,
  'crrt:local-feedback-v1': { version: 1, name: 'Local feedback', comments: Array.from({ length: count }, (_, i) => ({ ...comments[i % 3], id: `local-${i}`, pageUrl: 'https://example.test/pricing', createdAt: fixedTime })) },
}
export const browser = {
  storage: {
    local: {
      async get(key: string) { return { [key]: storage[key] } },
      async set(value: Record<string, unknown>) { Object.assign(storage, value) },
      async remove(key: string) { delete storage[key] },
    }, onChanged: { addListener() {}, removeListener() {} },
  },
  tabs: { async query() { return [{ id: 1, url: state === 'restricted' ? 'chrome://extensions' : 'https://example.test/pricing' }] }, async create() {} },
  runtime: {
    async sendMessage(message: { type: string }) {
      if ((state === 'background-error' || state === 'auth-error') && message.type !== 'auth:get') return { ok: false, error: 'CRRT background is unavailable. Try again.' }
      if (message.type === 'auth:hosted-sign-in') return new Promise<never>(() => {})
      return { ok: true, data: session }
    }, getURL: (path: string) => path,
  },
}
export const extensionProjects = state === 'no-projects' ? [] : state === 'ambiguous' ? [project, { ...project, publicKey: 'second', name: 'Second matching project' }] : [project]
