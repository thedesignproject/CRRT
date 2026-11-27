// Direct delivery needs the dispatch API (agent listeners + SEND queue).
// It stays off until that API ships, so Send to Agent keeps the prompt handoff.
export function directSendFlag(value: string | undefined) {
  return value === '1'
}

export const directSendEnabled = directSendFlag(import.meta.env.VITE_DIRECT_SEND)
