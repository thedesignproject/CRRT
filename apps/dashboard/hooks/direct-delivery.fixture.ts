import { vi } from 'vitest'
import type { DirectDelivery } from './useDirectDelivery'

const listener = (listenerId: string, online = true) => ({ listenerId, label: `term ${listenerId}`, repoUrl: '', online, stopped: !online })

export function delivery(over: Partial<DirectDelivery> = {}): DirectDelivery {
  return {
    enabled: true, listeners: [listener('l1'), listener('l2', false)], destination: 'l1', setDestination: vi.fn(),
    online: true, checking: false, busy: false, error: null, stateFor: () => undefined, send: vi.fn(async () => {}),
    ...over,
  }
}
